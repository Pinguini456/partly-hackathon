import { NextRequest, NextResponse } from "next/server";
import {GoogleGenAI} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const car_makes = {
    "NUE975": "holden-barina",
    "EZU765": "hyundai-iload",
    "PNS53": "hyundai-santafe",
    "RFH447": "jaguar-epace",
    "RLP440": "mitsubishi-outlander",
    "JZU83": "nissan-juke",
    "RFT360": "nissan-silvia",
    "PBU474": "renault",
    "NNS414": "suzuki",
    "NYE733": "toyota-hiace",
    "PKW74": "toyota-prius",
    "QMN16": "toyota-yaris",
};

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

        // @ts-ignore
        let text = car_makes[res.text] + "-" + res.text.toLowerCase();

        return NextResponse.json({ description: text });
    } catch (err) {
        console.error(err);
        return NextResponse.json({ error: "Number plate extraction failed" });
    }
}