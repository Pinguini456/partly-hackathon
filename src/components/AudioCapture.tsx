"use client";

// Capture a spoken clip either by recording it here or by dropping in a file
// already recorded on a phone. Both paths exist deliberately: recording is
// the natural thing at a service desk, but mic permission can be refused or
// unavailable (insecure origin, no input device, locked-down browser), and
// when that happens the feature has to degrade to something that still
// works rather than disappearing.

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Upload, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/src/components/ui/button";

type Props = {
    /** Fires when a clip is ready — recorded or uploaded. */
    onCapture: (file: File | null) => void;
    disabled?: boolean;
    busy?: boolean;
    busyLabel?: string;
};

function formatElapsed(ms: number) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

export function AudioCapture({ onCapture, disabled, busy, busyLabel }: Props) {
    const [recording, setRecording] = useState(false);
    const [elapsed, setElapsed] = useState(0);
    const [clip, setClip] = useState<{ file: File; url: string } | null>(null);
    const [micError, setMicError] = useState<string | null>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const streamRef = useRef<MediaStream | null>(null);

    // Object URLs outlive the component unless revoked, and a stray open mic
    // is worse — release both on unmount.
    useEffect(() => {
        return () => {
            if (clip?.url) URL.revokeObjectURL(clip.url);
            streamRef.current?.getTracks().forEach((t) => t.stop());
        };
    }, [clip?.url]);

    useEffect(() => {
        if (!recording) return;
        const start = Date.now();
        setElapsed(0);
        const id = setInterval(() => setElapsed(Date.now() - start), 250);
        return () => clearInterval(id);
    }, [recording]);

    function setCaptured(file: File) {
        if (clip?.url) URL.revokeObjectURL(clip.url);
        const url = URL.createObjectURL(file);
        setClip({ file, url });
        onCapture(file);
    }

    function clearClip() {
        if (clip?.url) URL.revokeObjectURL(clip.url);
        setClip(null);
        onCapture(null);
    }

    async function startRecording() {
        setMicError(null);

        if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
            setMicError("Recording isn't available in this browser — upload a file instead.");
            return;
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            chunksRef.current = [];

            const recorder = new MediaRecorder(stream);
            recorder.ondataavailable = (e) => {
                if (e.data.size > 0) chunksRef.current.push(e.data);
            };
            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, {
                    type: recorder.mimeType || "audio/webm",
                });
                // ffmpeg sniffs the container server-side, so the extension
                // here is cosmetic — it just has to be a real File.
                setCaptured(new File([blob], "customer-interview.webm", { type: blob.type }));
                streamRef.current?.getTracks().forEach((t) => t.stop());
                streamRef.current = null;
            };

            recorderRef.current = recorder;
            recorder.start();
            setRecording(true);
        } catch {
            setMicError(
                "Couldn't access the microphone — check permissions, or upload a recording instead.",
            );
        }
    }

    function stopRecording() {
        recorderRef.current?.stop();
        recorderRef.current = null;
        setRecording(false);
    }

    return (
        <div className="rounded-lg border border-dashed p-4">
            {busy ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {busyLabel ?? "Transcribing…"}
                </p>
            ) : clip ? (
                <div className="space-y-3">
                    <audio src={clip.url} controls className="w-full" />
                    <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                            {clip.file.name}
                        </span>
                        <Button variant="ghost" size="xs" onClick={clearClip} disabled={disabled}>
                            <Trash2 />
                            Remove
                        </Button>
                    </div>
                </div>
            ) : recording ? (
                <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium text-destructive">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-destructive" />
                        Recording {formatElapsed(elapsed)}
                    </span>
                    <Button size="sm" onClick={stopRecording}>
                        <Square />
                        Stop
                    </Button>
                </div>
            ) : (
                <div className="flex flex-wrap items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={startRecording}
                        disabled={disabled}
                    >
                        <Mic />
                        Record
                    </Button>
                    <span className="text-xs text-muted-foreground">or</span>
                    <label
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[0.8rem] font-medium hover:bg-muted ${
                            disabled ? "pointer-events-none opacity-50" : ""
                        }`}
                    >
                        <Upload className="h-3.5 w-3.5" />
                        Upload audio
                        <input
                            type="file"
                            accept="audio/*,video/*"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) setCaptured(f);
                                e.target.value = "";
                            }}
                        />
                    </label>
                </div>
            )}

            {micError && <p className="mt-2 text-xs text-amber-700">{micError}</p>}
        </div>
    );
}
