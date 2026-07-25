import { NextRequest, NextResponse } from "next/server";
import {GoogleGenAI} from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

export async function POST(req: NextRequest) {

}