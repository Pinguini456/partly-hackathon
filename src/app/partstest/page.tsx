"use client";

import { useState } from "react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Alert, AlertDescription } from "@/src/components/ui/alert";

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
        <div className="mx-auto max-w-3xl p-6">
            <h1 className="text-2xl font-semibold text-foreground">Upload Test</h1>

            <form onSubmit={handleSubmit} className="mt-6 flex items-center gap-3">
                <Input
                    type="file"
                    multiple
                    accept="image/*,video/*"
                    onChange={(e) => setFiles(e.target.files)}
                    className="max-w-sm"
                />
                <Button type="submit" disabled={loading}>
                    {loading ? "Uploading..." : "Upload"}
                </Button>
            </form>

            {error && (
                <Alert variant="destructive" className="mt-4">
                    <AlertDescription>Error: {error}</AlertDescription>
                </Alert>
            )}

            {result && (
                <div className="mt-6">
                    <h2 className="text-lg font-semibold text-foreground">Results</h2>
                    {result.id.length === 0 && (
                        <p className="mt-2 text-muted-foreground">No parts returned.</p>
                    )}
                    <div className="mt-3 space-y-3">
                        {result.id.map((id, i) => (
                            <Card key={id}>
                                <CardContent>
                                    <p className="text-sm text-muted-foreground">
                                        <strong className="text-foreground">ID:</strong> {id}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        <strong className="text-foreground">Name:</strong>{" "}
                                        {result.name[i]}
                                    </p>
                                    {result.image[i] && (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={result.image[i]}
                                            alt={result.name[i]}
                                            className="mt-3 h-auto max-w-full rounded-md"
                                        />
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}