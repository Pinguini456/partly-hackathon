import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink } from "node:fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import {Groq} from "groq-sdk";
import fs from "fs";

ffmpeg.setFfmpegPath(ffmpegPath as string);

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
    let videoPath: string | null = null;
    let audioPath: string | null = null;

    try {
        const formData = await req.formData();
        const file = formData.get("video") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No video file provided" }, { status: 400 });
        }

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        videoPath = join(tmpdir(), `${Date.now()}-input.mp4`);
        audioPath = join(tmpdir(), `${Date.now()}-output.mp3`);
        await writeFile(videoPath, buffer);

        // extract audio
        await new Promise<void>((resolve, reject) => {
            ffmpeg(videoPath!)
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

        return NextResponse.json({ text: transcription.text });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Failed to transcribe video" }, { status: 500 });
    } finally {
        if (videoPath) await unlink(videoPath).catch(() => {});
        if (audioPath) await unlink(audioPath).catch(() => {});
    }
}
