"use client";

import { useState } from "react";

interface Transcript {
    fileName: string;
    text?: string;
    error?: string;
}

interface UploadResult {
    make: string | null;
    imagesChecked: number;
    totalImages: number;
    transcripts: Transcript[];
    error?: string;
}

export default function TestUploadPage() {
    const [files, setFiles] = useState<File[]>([]);
    const [result, setResult] = useState<UploadResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files;
        if (!selected) return;

        setFiles(Array.from(selected));
        setResult(null);
        setError(null);
    };

    const handleSubmit = async () => {
        if (files.length === 0) return;

        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const formData = new FormData();
            files.forEach((file) => formData.append("files", file));

            const res = await fetch("/api/main", {
                method: "POST",
                body: formData,
            });

            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else {
                setResult(data);
            }
        } catch (err) {
            console.error(err);
            setError("Request failed");
        } finally {
            setLoading(false);
        }
    };

    const images = files.filter((f) => f.type.startsWith("image/"));
    const videos = files.filter((f) => f.type.startsWith("video/"));

    return (
        <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
            <h1>Upload Test</h1>
            <p style={{ color: "#666" }}>
                Select one or more images and/or videos. Images are checked against
                the VIN api until a valid make is found; videos are transcribed.
            </p>

            <input
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileChange}
            />

            {files.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    <p>
                        <strong>{images.length}</strong> image(s), <strong>{videos.length}</strong> video(s) selected
                    </p>
                    <ul style={{ fontSize: 14, color: "#444" }}>
                        {files.map((f, i) => (
                            <li key={i}>
                                {f.name} ({f.type || "unknown type"})
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={files.length === 0 || loading}
                style={{ marginTop: 16, padding: "8px 16px" }}
            >
                {loading ? "Processing..." : "Upload & Process"}
            </button>

            {error && (
                <p style={{ marginTop: 16, color: "crimson" }}>
                    <strong>Error:</strong> {error}
                </p>
            )}

            {result && (
                <div style={{ marginTop: 24 }}>
                    <h2>Result</h2>

                    <div style={{ marginBottom: 16 }}>
                        <strong>Make:</strong>{" "}
                        {result.make ?? (
                            <span style={{ color: "#999" }}>Not found</span>
                        )}
                        <div style={{ fontSize: 13, color: "#666" }}>
                            Checked {result.imagesChecked} of {result.totalImages} image(s)
                        </div>
                    </div>

                    <div>
                        <strong>Transcripts:</strong>
                        {result.transcripts.length === 0 && (
                            <p style={{ color: "#999", fontSize: 14 }}>No videos uploaded</p>
                        )}
                        <ul>
                            {result.transcripts.map((t, i) => (
                                <li key={i} style={{ marginBottom: 8 }}>
                                    <div style={{ fontWeight: 600 }}>{t.fileName}</div>
                                    {t.text && <div>{t.text}</div>}
                                    {t.error && (
                                        <div style={{ color: "crimson" }}>{t.error}</div>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}