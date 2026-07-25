"use client";

import { useState } from "react";

export default function TestPartsPage() {
    const [transcription, setTranscription] = useState("");
    const [make, setMake] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [partIds, setPartIds] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async () => {
        if (!transcription || !make) return;

        setLoading(true);
        setResult(null);
        setPartIds([]);
        setError(null);

        try {
            const res = await fetch("/api/identify-parts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ transcription, make }),
            });

            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else {
                setResult(data.description);
                setPartIds(
                    data.description
                        ? data.description.split("/").map((id: string) => id.trim())
                        : []
                );
            }
        } catch (err) {
            console.error(err);
            setError("Request failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
            <h1>Parts Lookup Test</h1>
            <p style={{ color: "#666" }}>
                Enter a vehicle slug and a transcript describing what's damaged —
                this hits the parts API and returns matching part ids.
            </p>

            <div style={{ marginTop: 16 }}>
                <label style={{ display: "block", marginBottom: 4 }}>
                    Vehicle slug (make)
                </label>
                <input
                    type="text"
                    value={make}
                    onChange={(e) => setMake(e.target.value)}
                    placeholder="e.g. hyundai-iload-ezu765"
                    style={{ width: "100%", padding: 8 }}
                />
            </div>

            <div style={{ marginTop: 16 }}>
                <label style={{ display: "block", marginBottom: 4 }}>
                    Transcription
                </label>
                <textarea
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    placeholder="e.g. The front bumper is cracked and the left headlight is smashed"
                    rows={5}
                    style={{ width: "100%", padding: 8 }}
                />
            </div>

            <button
                onClick={handleSubmit}
                disabled={!transcription || !make || loading}
                style={{ marginTop: 16, padding: "8px 16px" }}
            >
                {loading ? "Finding parts..." : "Find Parts"}
            </button>

            {error && (
                <p style={{ marginTop: 16, color: "crimson" }}>
                    <strong>Error:</strong> {error}
                </p>
            )}

            {result && (
                <div style={{ marginTop: 24 }}>
                    <h2>Result</h2>
                    <p style={{ fontSize: 14, color: "#666" }}>Raw response:</p>
                    <pre
                        style={{
                            background: "#f5f5f5",
                            padding: 12,
                            borderRadius: 4,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-all",
                        }}
                    >
                        {result}
                    </pre>

                    <p style={{ fontSize: 14, color: "#666", marginTop: 12 }}>
                        Parsed part ids ({partIds.length}):
                    </p>
                    <ul>
                        {partIds.map((id, i) => (
                            <li key={i} style={{ fontFamily: "monospace", fontSize: 13 }}>
                                {id}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}