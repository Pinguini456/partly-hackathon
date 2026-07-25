"use client";

import { useState } from "react";

export default function TestPlatePage() {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [result, setResult] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = e.target.files?.[0];
        if (!selected) return;

        setFile(selected);
        setResult(null);
        setError(null);
        setPreview(URL.createObjectURL(selected));
    };

    const fileToBase64 = (f: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                // reader.result looks like "data:image/jpeg;base64,AAAA..."
                const base64 = (reader.result as string).split(",")[1];
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(f);
        });
    };

    const handleSubmit = async () => {
        if (!file) return;

        setLoading(true);
        setResult(null);
        setError(null);

        try {
            const imageBase64 = await fileToBase64(file);

            const res = await fetch("/api/vin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imageBase64,
                    mimeType: file.type,
                }),
            });

            const data = await res.json();

            if (data.error) {
                setError(data.error);
            } else {
                setResult(data.description);
            }
        } catch (err) {
            console.error(err);
            setError("Request failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ maxWidth: 480, margin: "40px auto", padding: 16 }}>
            <h1>Number Plate Test</h1>

            <input type="file" accept="image/*" onChange={handleFileChange} />

            {preview && (
                <div style={{ marginTop: 16 }}>
                    <img
                        src={preview}
                        alt="preview"
                        style={{ maxWidth: "100%", borderRadius: 8 }}
                    />
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={!file || loading}
                style={{ marginTop: 16, padding: "8px 16px" }}
            >
                {loading ? "Checking..." : "Extract Plate"}
            </button>

            {result && (
                <p style={{ marginTop: 16 }}>
                    <strong>Plate:</strong> {result}
                </p>
            )}

            {error && (
                <p style={{ marginTop: 16, color: "crimson" }}>
                    <strong>Error:</strong> {error}
                </p>
            )}
        </div>
    );
}