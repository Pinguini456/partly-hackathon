// Asks questions of one specific job. The whole case is assembled into the
// prompt server-side rather than trusted from the client, so the answer is
// grounded in what's actually on the record — and the model is told to say
// when the record doesn't cover it rather than filling the gap.

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/src/lib/supabase/server";
import { parseIntake } from "@/src/lib/intake";
import { vehicleLabel, vehiclePlate } from "@/src/lib/vehicles";
import { progressOf } from "@/src/lib/caseProgress";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

type ChatTurn = { role: "user" | "model"; text: string };

function buildContext(c: Record<string, any>): string {
    const intake = parseIntake(c.summary);
    const parts = c.parts as { name?: string[] } | null;
    const basket = c.basket as
        | { label?: string; total?: number; lines?: { name: string; supplier: string; price: number; eta: string }[] }
        | null;
    const notes = (c.notes ?? []) as { text: string; at: string }[];

    const lines: string[] = [
        `CASE ${c.id}`,
        `Vehicle: ${vehicleLabel(c.vehicle_slug)}${vehiclePlate(c.vehicle_slug) ? ` (plate ${vehiclePlate(c.vehicle_slug)})` : ""}`,
        `Customer: ${c.customer_name ?? "unknown"}${c.customer_contact ? ` — ${c.customer_contact}` : ""}`,
        `Current stage: ${progressOf(c.status).stage.label}`,
        `Opened: ${new Date(c.created_at).toLocaleDateString("en-NZ")}`,
    ];

    if (intake.insurance && Object.values(intake.insurance).some(Boolean)) {
        const i = intake.insurance;
        lines.push(
            `Insurance: ${[i.insurer, i.policyNumber && `policy ${i.policyNumber}`, i.claimNumber && `claim ${i.claimNumber}`, i.excess && `excess ${i.excess}`]
                .filter(Boolean)
                .join(", ")}`,
        );
    } else {
        lines.push("Insurance: none on file (private pay)");
    }

    if (intake.problems?.length) {
        lines.push(
            "\nWHAT THE CUSTOMER REPORTED:",
            ...intake.problems.map((p) => `- ${p.summary} (their words: "${p.quote}")`),
        );
    }

    if (intake.todos?.length) {
        lines.push(
            "\nJOB LIST:",
            ...intake.todos.map(
                (t) => `- [${t.status}] ${t.task}${t.reason ? ` — ${t.reason}` : ""}`,
            ),
        );
    }

    if (parts?.name?.length) {
        lines.push("\nIDENTIFIED PARTS:", ...parts.name.map((n) => `- ${n}`));
    }

    if (basket?.lines?.length) {
        lines.push(
            `\nORDER (${basket.label ?? "placed"}, total $${basket.total ?? 0}):`,
            ...basket.lines.map((l) => `- ${l.name} from ${l.supplier}, $${l.price}, ETA ${l.eta}`),
        );
    }

    if (intake.messages?.length) {
        lines.push(
            "\nMESSAGES ALREADY SENT TO THE CUSTOMER:",
            ...intake.messages.map((m) => `- ${m.text}`),
        );
    }

    if (notes.length) {
        lines.push("\nMECHANIC NOTES:", ...notes.map((n) => `- ${n.text}`));
    }

    if (c.transcript) lines.push(`\nTECHNICIAN INSPECTION TRANSCRIPT:\n${c.transcript}`);
    if (intake.interviewTranscript)
        lines.push(`\nCUSTOMER CONVERSATION TRANSCRIPT:\n${intake.interviewTranscript}`);

    return lines.join("\n");
}

const SYSTEM = `You are the assistant inside a collision repair shop's job system, answering about ONE job.

Rules:
- Answer only from the case record below. If it doesn't say, reply that the record doesn't cover it and suggest what to check.
- You are talking to a panel beater, not an office worker. Be direct and brief — two or three sentences unless asked for more.
- Never invent part numbers, prices, dates or quotes. Quote the customer verbatim when it's relevant.
- If asked to draft a message to the customer, write it plainly and warmly, no jargon, ready to send as a text.`;

export async function POST(req: NextRequest) {
    const { caseId, messages } = (await req.json().catch(() => ({}))) as {
        caseId?: string;
        messages?: ChatTurn[];
    };

    if (!caseId || !messages?.length) {
        return NextResponse.json({ error: "Missing caseId or messages" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: caseRow, error } = await supabase
        .from("inspections")
        .select("*")
        .eq("id", caseId)
        .single();

    if (error || !caseRow) {
        return NextResponse.json({ error: "Case not found" }, { status: 404 });
    }

    try {
        const res = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite",
            contents: [
                { role: "user", parts: [{ text: `${SYSTEM}\n\n=== CASE RECORD ===\n${buildContext(caseRow)}` }] },
                {
                    role: "model",
                    parts: [{ text: "Got it — I have this job in front of me. What do you need?" }],
                },
                ...messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
            ],
        });

        return NextResponse.json({ reply: res.text ?? "" });
    } catch (err) {
        console.error("chat failed", err);
        return NextResponse.json({ error: "Couldn't reach the assistant" }, { status: 500 });
    }
}
