"use client";

import { useState } from "react";

export default function Home() {
    const [file, setFile] = useState<File | null>(null);
    const [transcript, setTranscript] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setError("Please select a video file first.");
            return;
        }

        setLoading(true);
        setError(null);
        setTranscript("");

        try {
            const formData = new FormData();
            formData.append("video", file);

            const res = await fetch("/api/speech_to_text", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "Failed to transcribe video");
            }

            setTranscript(data.text);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Something went wrong");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main style={{ maxWidth: 600, margin: "40px auto", padding: "0 20px" }}>
            <h1>Video Transcription</h1>
            <p>Upload a video and get a text transcript of its audio.</p>

            <form onSubmit={handleSubmit} style={{ marginTop: 24 }}>
                <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <button
                    type="submit"
                    disabled={loading || !file}
                    style={{ marginLeft: 12, padding: "6px 16px" }}
                >
                    {loading ? "Transcribing..." : "Transcribe"}
                </button>
            </form>

            {error && (
                <p style={{ color: "red", marginTop: 16 }}>
                    {error}
                </p>
            )}

            {transcript && (
                <div style={{ marginTop: 24 }}>
                    <h2>Transcript</h2>
                    <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                        {transcript}
                    </p>
                </div>
            )}
        </main>
    );
}