import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import { Groq } from "groq-sdk";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";

ffmpeg.setFfmpegPath(ffmpegPath as string);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// The customer interview is a different input to the technician walkaround,
// and it does a different job. The walkaround names collision parts; this is
// the owner describing symptoms in their own words ("it's making a juddering
// sound", "there's oil on the driveway"). Those two shouldn't be mixed:
// symptom language produces junk matches against a parts catalogue, and the
// mechanical follow-ups it implies never show up in a parts list at all.
//
// So this route keeps the customer's own words, and separately infers the
// work they imply — as *suggestions* a mechanic accepts or throws away, not
// as facts. Nobody should be ordering work off an LLM's read of a phone call.

export type CustomerProblem = {
    /** The issue in shop language. */
    summary: string;
    /** What the customer actually said, near-verbatim, so it's checkable. */
    quote: string;
};

export type SuggestedTodo = {
    task: string;
    /** Why this follows from what was said — shown to the mechanic. */
    reason: string;
    /** The customer phrase that triggered it. */
    fromQuote: string;
};

const EXTRACTION_PROMPT = `You are helping a panel/mechanical repair shop triage a job.

Below is a transcript of a customer describing problems with their vehicle at drop-off.

Return STRICT JSON only, no markdown fences, in exactly this shape:
{
  "problems": [{"summary": "...", "quote": "..."}],
  "todos": [{"task": "...", "reason": "...", "fromQuote": "..."}]
}

Rules:
- "problems" = what the CUSTOMER reported, one entry per distinct issue. "quote" must be the customer's own words from the transcript, near-verbatim and short. Do not invent issues they did not mention.
- "todos" = concrete diagnostic or repair tasks a technician should carry out, inferred from those reports. Phrase as an instruction ("Inspect ... for ...", "Check ...", "Replace ..."). "reason" is one short clause explaining the inference. "fromQuote" must match the customer phrase that prompted it.
- Prefer inspection/diagnosis over assuming a fix when the cause is not certain from the description.
- If the transcript contains no vehicle problems at all, return empty arrays.

Transcript:
`;

function parseExtraction(raw: string): {
    problems: CustomerProblem[];
    todos: SuggestedTodo[];
} {
    // Models still fence JSON sometimes despite being told not to.
    const cleaned = raw
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();

    try {
        const parsed = JSON.parse(cleaned);
        return {
            problems: Array.isArray(parsed.problems) ? parsed.problems : [],
            todos: Array.isArray(parsed.todos) ? parsed.todos : [],
        };
    } catch {
        // A failed extraction must not cost the shop the transcript itself —
        // that's the part with real evidentiary value.
        return { problems: [], todos: [] };
    }
}

export async function POST(req: NextRequest) {
    let inputPath: string | null = null;
    let audioPath: string | null = null;

    try {
        const formData = await req.formData();
        const file = formData.get("audio") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const stamp = Date.now();
        // Extension-less on purpose: ffmpeg sniffs the container, and browser
        // recordings arrive as webm/opus while uploads are usually m4a or wav.
        inputPath = join(tmpdir(), `${stamp}-interview-input`);
        audioPath = join(tmpdir(), `${stamp}-interview.mp3`);
        await writeFile(inputPath, buffer);

        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath!)
                .noVideo()
                .audioCodec("libmp3lame")
                .audioBitrate("64k")
                .audioChannels(1)
                .output(audioPath!)
                .on("end", () => resolve())
                .on("error", (err) => reject(err))
                .run();
        });

        const transcription = await groq.audio.transcriptions.create({
            file: fs.createReadStream(audioPath),
            model: "whisper-large-v3-turbo",
        });

        const transcript = (transcription.text ?? "").trim();
        if (!transcript) {
            return NextResponse.json({ transcript: "", problems: [], todos: [] });
        }

        let problems: CustomerProblem[] = [];
        let todos: SuggestedTodo[] = [];

        try {
            const res = await ai.models.generateContent({
                model: "gemini-3.1-flash-lite",
                contents: [{ text: EXTRACTION_PROMPT + transcript }],
            });
            ({ problems, todos } = parseExtraction(res.text ?? ""));
        } catch (err) {
            // Same reasoning as the parse failure above: hand back the
            // transcript regardless so the interview isn't lost.
            console.error("interview extraction failed", err);
        }

        return NextResponse.json({ transcript, problems, todos });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to process interview" }, { status: 500 });
    } finally {
        if (inputPath) await unlink(inputPath).catch(() => {});
        if (audioPath) await unlink(audioPath).catch(() => {});
    }
}
