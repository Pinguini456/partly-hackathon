import { NextRequest, NextResponse } from "next/server";
import {GoogleGenAI} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function POST(req: NextRequest) {
    const { imageBase64, mimeType } = await req.json();

    if (!imageBase64) {
        return NextResponse.json({ error: "Missing image" }, { status: 400 });
    }

    try {
        const res = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: [
                { text: "What is this vehicles number plate? Reply only with the number plate in all caps. if no number plate is visible, reply with 'None'"},
                { inlineData: { mimeType: mimeType || "image/jpeg", data: imageBase64 } },
            ],
        });

        if (res.text === 'None') {
            return NextResponse.json({ error: "No number plate visible" });
        }

        return NextResponse.json({ description: res.text });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Number plate extraction failed" });
    }
}