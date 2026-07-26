"use client";

import { useState } from "react";

type UploadResponse = {
    id: string[];
    name: string[];
    image: string[];
};

type UploadError = {
    error: string;
};

export default function TestPage() {
    const [files, setFiles] = useState<FileList | null>(null);
    const [result, setResult] = useState<UploadResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (!files || files.length === 0) {
            setError("Select at least one file");
            return;
        }

        setLoading(true);
        setError(null);
        setResult(null);

        const formData = new FormData();
        for (const file of Array.from(files)) {
            formData.append("files", file);
        }

        try {
            const res = await fetch("/api/main", {
                method: "POST",
                body: formData,
            });

            const data: UploadResponse | UploadError = await res.json();

            if ("error" in data) {
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
    }

    return (
        <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
            <h1>Upload Test</h1>

            <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
                <input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => setFiles(e.target.files)}
                />
                <button type="submit" disabled={loading} style={{ marginLeft: 12 }}>
                    {loading ? "Uploading..." : "Upload"}
                </button>
            </form>

            {error && <p style={{ color: "red" }}>Error: {error}</p>}

            {result && (
                <div>
                    <h2>Results</h2>
                    {result.id.length === 0 && <p>No parts returned.</p>}
                    {result.id.map((id, i) => (
                        <div
                            key={id}
                            style={{
                                border: "1px solid #ccc",
                                borderRadius: 8,
                                padding: 12,
                                marginBottom: 12,
                            }}
                        >
                            <p>
                                <strong>ID:</strong> {id}
                            </p>
                            <p>
                                <strong>Name:</strong> {result.name[i]}
                            </p>
                            {result.image[i] && (
                                <img
                                    src={result.image[i]}
                                    alt={result.name[i]}
                                    style={{ maxWidth: "100%", height: "auto" }}
                                />
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}