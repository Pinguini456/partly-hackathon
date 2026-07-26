"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
    Upload,
    Video,
    Image,
    Mic,
    FileText,
    AlertTriangle,
    Plus,
    X,
    Play,
    CheckCircle2,
    Loader2,
    Circle,
} from "lucide-react";
import { WorkflowSteps } from "@/src/components/WorkflowSteps";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/src/components/ui/alert";
import { Progress } from "@/src/components/ui/progress";
import { Dialog, DialogContent, DialogTitle } from "@/src/components/ui/dialog";

type UploadedFile = { id: string; file: File; previewUrl: string | null };

type Inspection = {
    files: UploadedFile[];
    status: "uploaded" | "analysing" | "complete";
};

type RemovedFile = { item: UploadedFile; index: number };
type PreviewTarget = { name: string; url: string; kind: "image" | "video" };

const MAX_FILE_SIZE = 500 * 1024 * 1024;
const MAX_FILES = 20;
const ACCEPTED_FORMATS = "MP4, MOV, JPG, PNG, HEIC, WAV or M4A";
const UNDO_WINDOW_MS = 6000;

type StepKey = "transcribe" | "identify" | "match" | "compare";

// FABRICATED: /api/main answers in one round trip, not step by step, so
// there's no real signal for "which step is running right now" — these
// durations just pace the checklist to feel proportional. The one exception
// is the vehicle name surfaced on the "identify" step: that's the real VIN
// lookup result, just displayed once the checklist reaches that step rather
// than the instant the response lands.
const STEPS: { key: StepKey; label: string; estMs: number }[] = [
    { key: "transcribe", label: "Transcribing technician notes", estMs: 7000 },
    { key: "identify", label: "Identifying vehicle configuration", estMs: 10000 },
    { key: "match", label: "Matching OEM replacement parts", estMs: 13000 },
    { key: "compare", label: "Comparing supplier options", estMs: 10000 },
];
const TOTAL_ESTIMATE_MS = STEPS.reduce((s, x) => s + x.estMs, 0);

function formatBytes(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
    const total = Math.round(seconds);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function stepIndexFromElapsed(ms: number) {
    let acc = 0;
    for (let i = 0; i < STEPS.length; i++) {
        acc += STEPS[i].estMs;
        if (ms < acc) return i;
    }
    return STEPS.length - 1; // hold on the last step (spinner) if it runs long
}

export default function Home() {
    const router = useRouter();

    const [inspection, setInspection] = useState<Inspection | null>(null);
    const [analysing, setAnalysing] = useState(false);
    const [complete, setComplete] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [lastRemoved, setLastRemoved] = useState<RemovedFile | null>(null);
    const [preview, setPreview] = useState<PreviewTarget | null>(null);
    const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [elapsedMs, setElapsedMs] = useState(0);
    const [stepResults, setStepResults] = useState<Partial<Record<StepKey, string>>>({});
    const [finishing, setFinishing] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);

    function addFiles(newFiles: File[]) {
        if (!newFiles.length) return;
        const wrapped: UploadedFile[] = newFiles.map((file) => ({
            id: crypto.randomUUID(),
            file,
            previewUrl:
                file.type.startsWith("image/") || file.type.startsWith("video/")
                    ? URL.createObjectURL(file)
                    : null,
        }));
        setInspection((prev) => ({
            files: prev ? [...prev.files, ...wrapped] : wrapped,
            status: "uploaded",
        }));
        setComplete(false);
    }

    function removeFile(id: string) {
        setInspection((prev) => {
            if (!prev) return prev;
            const index = prev.files.findIndex((f) => f.id === id);
            if (index === -1) return prev;
            const item = prev.files[index];
            const files = prev.files.filter((f) => f.id !== id);

            // The object URL stays alive until the undo window closes —
            // revoking it immediately would leave "Undo" restoring a file
            // with a dead thumbnail.
            if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
            setLastRemoved({ item, index });
            undoTimerRef.current = setTimeout(() => {
                if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
                setLastRemoved((cur) => (cur?.item.id === item.id ? null : cur));
            }, UNDO_WINDOW_MS);

            return files.length ? { ...prev, files } : null;
        });
    }

    function undoRemove() {
        if (!lastRemoved) return;
        if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
        const { item, index } = lastRemoved;
        setInspection((prev) => {
            const files = prev ? [...prev.files] : [];
            files.splice(Math.min(index, files.length), 0, item);
            return { files, status: "uploaded" };
        });
        setLastRemoved(null);
    }

    function openPreview(item: UploadedFile) {
        if (!item.previewUrl) return;
        setPreview({
            name: item.file.name,
            url: item.previewUrl,
            kind: item.file.type.startsWith("video/") ? "video" : "image",
        });
    }

    const {
        getRootProps,
        getInputProps,
        isDragActive,
        fileRejections,
        open: openFilePicker,
    } = useDropzone({
        accept: {
            "video/*": [],
            "image/*": [],
            "audio/*": [],
        },
        maxSize: MAX_FILE_SIZE,
        maxFiles: MAX_FILES,
        // We trigger the dialog manually (see the individual onClick handlers
        // below) instead of letting the root open it on any click — once the
        // file-type chips live inside the same drop target, a click on a
        // chip would otherwise bubble up and pop a second dialog.
        noClick: true,
        noKeyboard: true,
        onDrop: addFiles,
    });

    // Drives both the progress bar and the checklist's active step — a
    // single ticking clock rather than a chain of setTimeouts, so cancelling
    // is just "stop rendering", not "remember to clear N timers".
    useEffect(() => {
        if (!analysing) return;
        setElapsedMs(0);
        const start = Date.now();
        const id = setInterval(() => setElapsedMs(Date.now() - start), 200);
        return () => clearInterval(id);
    }, [analysing]);

    async function analyseInspection() {
        if (!inspection) return;

        setAnalysing(true);
        setErrorMsg(null);
        setStepResults({});
        setFinishing(false);
        setInspection({ ...inspection, status: "analysing" });

        const controller = new AbortController();
        controllerRef.current = controller;

        const formData = new FormData();
        inspection.files.forEach(({ file }) => formData.append("files", file));

        try {
            const response = await fetch("/api/main", {
                method: "POST",
                body: formData,
                signal: controller.signal,
            });

            const data = await response.json();

            if (!response.ok || data.error || !data.id?.length) {
                console.error("API error", data);
                setInspection((prev) => (prev ? { ...prev, status: "complete" } : prev));
                setErrorMsg(data.error ?? "Unable to identify any parts from the uploaded files.");
                setAnalysing(false);
                setComplete(true);
                return;
            }

            if (data.vehicle) setStepResults({ identify: data.vehicle });
            setFinishing(true);
            sessionStorage.setItem("partly:parts", JSON.stringify(data));
            // Let the checklist land on "all done" for a beat instead of
            // yanking the page away the instant the response arrives.
            await new Promise((resolve) => setTimeout(resolve, 900));
            router.push("/parts");
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                setInspection((prev) => (prev ? { ...prev, status: "uploaded" } : prev));
                setAnalysing(false);
                return;
            }
            console.error("Upload failed", error);
            setInspection((prev) => (prev ? { ...prev, status: "complete" } : prev));
            setErrorMsg("Upload failed. Please try again.");
            setAnalysing(false);
            setComplete(true);
        } finally {
            controllerRef.current = null;
        }
    }

    function cancelAnalysis() {
        controllerRef.current?.abort();
    }

    const fileCount = inspection?.files.length ?? 0;
    const totalBytes = inspection?.files.reduce((s, f) => s + f.file.size, 0) ?? 0;

    const activeStepIndex = finishing ? STEPS.length : stepIndexFromElapsed(elapsedMs);
    const progressPct = finishing ? 100 : Math.min(96, (elapsedMs / TOTAL_ESTIMATE_MS) * 100);

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-[800px] px-8 py-8">
                <h1 className="text-2xl font-semibold text-foreground">New inspection</h1>
                <p className="mt-1 text-sm text-muted-foreground">
                    Convert vehicle inspections into repair orders.
                </p>

                <div className="mt-8">
                    <WorkflowSteps current={analysing ? 2 : 1} />
                </div>

                {/* Upload controls — hidden during analysis so there's nothing
                    left clickable that could change the files mid-run. */}
                {!analysing && fileCount === 0 && (
                    <>
                        <div
                            {...getRootProps()}
                            onClick={openFilePicker}
                            className={`cursor-pointer rounded-xl border-2 border-dashed bg-card p-10 transition ${
                                isDragActive
                                    ? "border-primary bg-accent"
                                    : "hover:border-primary"
                            }`}
                        >
                            <input {...getInputProps()} />

                            <div className="flex flex-col items-center text-center">
                                <div className="rounded-full bg-accent p-4">
                                    <Upload className="h-7 w-7 text-primary" />
                                </div>

                                <h2 className="mt-4 text-xl font-semibold text-foreground">
                                    Upload inspection files
                                </h2>

                                <p className="mt-1 text-sm text-muted-foreground">Drag files here or</p>

                                <Button size="lg" className="mt-5">
                                    Choose Files
                                </Button>

                                <p className="mt-3 text-xs text-muted-foreground">
                                    {ACCEPTED_FORMATS} · up to {MAX_FILE_SIZE / 1024 / 1024}MB per file ·{" "}
                                    {MAX_FILES} files max
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                            <span className="mr-1">Add specific files:</span>
                            <FilePickerChip
                                id="picker-video"
                                icon={<Video className="h-4 w-4" />}
                                label="Video"
                                accept="video/*"
                                onFiles={addFiles}
                            />
                            <FilePickerChip
                                id="picker-photo"
                                icon={<Image className="h-4 w-4" />}
                                label="Photo"
                                accept="image/*"
                                onFiles={addFiles}
                            />
                            <FilePickerChip
                                id="picker-audio"
                                icon={<Mic className="h-4 w-4" />}
                                label="Voice note"
                                accept="audio/*"
                                onFiles={addFiles}
                            />
                        </div>
                    </>
                )}

                {!analysing && fileRejections.length > 0 && (
                    <Alert variant="destructive" className="mt-3">
                        <AlertTriangle />
                        <AlertDescription>
                            {fileRejections.map(({ file, errors }) => (
                                <p key={file.name}>
                                    {file.name}: {errors[0]?.message}
                                </p>
                            ))}
                        </AlertDescription>
                    </Alert>
                )}

                {/* Progress — promoted above the file list since this is where
                    the screen spends most of its life. */}
                {analysing && (
                    <>
                        <Card className="mt-6">
                            <CardContent>
                            <h2 className="text-xl font-semibold text-foreground">
                                Preparing repair summary
                            </h2>

                            <div className="mt-6 space-y-4">
                                {STEPS.map((step, i) => (
                                    <ProcessStep
                                        key={step.key}
                                        label={step.label}
                                        state={
                                            i < activeStepIndex
                                                ? "done"
                                                : i === activeStepIndex
                                                  ? "active"
                                                  : "pending"
                                        }
                                        result={stepResults[step.key]}
                                    />
                                ))}
                            </div>

                            <div className="mt-6">
                                <Progress value={progressPct} className="w-full" />
                                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>Usually takes about {Math.round(TOTAL_ESTIMATE_MS / 1000)} seconds</span>
                                    <span>{Math.round(progressPct)}%</span>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5">
                                <p className="text-xs text-muted-foreground">
                                    Stay on this page until this finishes — closing it will cancel the
                                    analysis.
                                </p>
                                <Button
                                    variant="outline"
                                    onClick={cancelAnalysis}
                                    disabled={finishing}
                                    className="shrink-0"
                                >
                                    Cancel
                                </Button>
                            </div>
                            </CardContent>
                        </Card>

                        {/* Collapsed one-line summary of what's being analysed —
                            the file list already did its job at upload time. */}
                        <div className="mt-4 flex items-center gap-2 rounded-lg border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4 shrink-0" />
                            {fileCount} file{fileCount === 1 ? "" : "s"} · {formatBytes(totalBytes)}
                        </div>
                    </>
                )}

                {/* Uploaded files — also a drop target, so adding one more
                    file doesn't mean hunting back up for the small bar. */}
                {inspection && !analysing && (
                    <Card
                        {...getRootProps()}
                        className={`mt-6 transition ${
                            isDragActive ? "ring-2 ring-primary" : ""
                        }`}
                    >
                        <CardContent>
                        <input {...getInputProps()} />

                        <div className="flex items-baseline justify-between">
                            <h2 className="text-xl font-semibold text-foreground">Uploaded files</h2>
                            <p className="text-sm text-muted-foreground">
                                {fileCount} of {MAX_FILES} · {formatBytes(totalBytes)}
                            </p>
                        </div>

                        {lastRemoved && (
                            <div className="mt-3 flex items-center justify-between rounded-lg bg-foreground px-4 py-2.5 text-sm text-background">
                                <span className="truncate">Removed {lastRemoved.item.file.name}</span>
                                <Button
                                    variant="link"
                                    size="sm"
                                    onClick={undoRemove}
                                    className="ml-3 h-auto shrink-0 p-0 text-background underline"
                                >
                                    Undo
                                </Button>
                            </div>
                        )}

                        <div className="mt-4 divide-y">
                            {inspection.files.map((item) => (
                                <FileRow
                                    key={item.id}
                                    item={item}
                                    onRemove={() => removeFile(item.id)}
                                    onPreview={() => openPreview(item)}
                                />
                            ))}
                        </div>

                        <div
                            onClick={openFilePicker}
                            className="mt-4 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-dashed px-3 py-2.5 text-sm hover:border-primary"
                        >
                            <span className="flex items-center gap-2 font-medium text-foreground">
                                <Plus className="h-4 w-4 text-primary" />
                                Add more files or drop here
                            </span>
                            <span className="flex items-center gap-1 text-muted-foreground">
                                <FilePickerChip
                                    id="picker-video"
                                    icon={<Video className="h-4 w-4" />}
                                    label="Video"
                                    accept="video/*"
                                    onFiles={addFiles}
                                />
                                <FilePickerChip
                                    id="picker-photo"
                                    icon={<Image className="h-4 w-4" />}
                                    label="Photo"
                                    accept="image/*"
                                    onFiles={addFiles}
                                />
                                <FilePickerChip
                                    id="picker-audio"
                                    icon={<Mic className="h-4 w-4" />}
                                    label="Voice note"
                                    accept="audio/*"
                                    onFiles={addFiles}
                                />
                            </span>
                        </div>

                        <div className="sticky bottom-4 z-10 mt-4 flex justify-end border-t bg-card/95 pt-4 backdrop-blur">
                            <Button size="lg" onClick={analyseInspection} className="w-60">
                                Analyse Inspection
                            </Button>
                        </div>
                        </CardContent>
                    </Card>
                )}

                {/* Error */}
                {complete && errorMsg && (
                    <Alert variant="destructive" className="mt-8">
                        <AlertTriangle />
                        <AlertTitle>Couldn&apos;t prepare a repair summary</AlertTitle>
                        <AlertDescription>
                            {errorMsg}
                            <Button
                                size="sm"
                                onClick={() => {
                                    setComplete(false);
                                    setErrorMsg(null);
                                }}
                                className="mt-4"
                            >
                                Try again
                            </Button>
                        </AlertDescription>
                    </Alert>
                )}
            </div>

            <Dialog open={preview != null} onOpenChange={(open) => !open && setPreview(null)}>
                <DialogContent className="max-w-3xl">
                    <DialogTitle>{preview?.name}</DialogTitle>
                    {preview?.kind === "image" ? (
                        // eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimisable asset
                        <img
                            src={preview.url}
                            alt={preview.name}
                            className="max-h-[70vh] w-full rounded-lg object-contain"
                        />
                    ) : preview ? (
                        <video
                            src={preview.url}
                            controls
                            autoPlay
                            className="max-h-[70vh] w-full rounded-lg"
                        />
                    ) : null}
                </DialogContent>
            </Dialog>
        </main>
    );
}

function ProcessStep({
    label,
    state,
    result,
}: {
    label: string;
    state: "done" | "active" | "pending";
    result?: string;
}) {
    return (
        <div className="flex items-start gap-3">
            {state === "done" && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />}
            {state === "active" && <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />}
            {state === "pending" && <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" />}
            <div>
                <p className={`text-sm ${state === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
                    {label}
                </p>
                {result && <p className="text-xs font-medium text-primary">→ {result}</p>}
            </div>
        </div>
    );
}

function FileRow({
    item,
    onRemove,
    onPreview,
}: {
    item: UploadedFile;
    onRemove: () => void;
    onPreview: () => void;
}) {
    const { file, previewUrl } = item;
    const canPreview = previewUrl != null;
    return (
        <div className="flex items-center gap-3 py-2">
            <Thumb file={file} previewUrl={previewUrl} onClick={canPreview ? onPreview : undefined} />
            <p className="max-w-[380px] truncate text-sm font-medium text-foreground">{file.name}</p>
            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
            <Button
                variant="ghost"
                size="icon-xs"
                onClick={onRemove}
                aria-label={`Remove ${file.name}`}
                className="shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            >
                <X />
            </Button>
        </div>
    );
}

function Thumb({
    file,
    previewUrl,
    onClick,
}: {
    file: File;
    previewUrl: string | null;
    onClick?: () => void;
}) {
    if (file.type.startsWith("image/") && previewUrl) {
        return (
            <button
                type="button"
                onClick={onClick}
                aria-label={`Preview ${file.name}`}
                className="shrink-0 overflow-hidden rounded-md hover:ring-2 hover:ring-ring"
            >
                {/* eslint-disable-next-line @next/next/no-img-element -- object URL, not an optimisable asset */}
                <img src={previewUrl} alt="" className="h-12 w-12 object-cover" />
            </button>
        );
    }
    if (file.type.startsWith("video/") && previewUrl) {
        return (
            <button
                type="button"
                onClick={onClick}
                aria-label={`Preview ${file.name}`}
                className="shrink-0 overflow-hidden rounded-md hover:ring-2 hover:ring-ring"
            >
                <VideoThumb src={previewUrl} />
            </button>
        );
    }
    if (file.type.startsWith("audio/")) {
        return (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-accent text-primary">
                <Mic className="h-4 w-4" />
            </div>
        );
    }
    return (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <FileText className="h-4 w-4" />
        </div>
    );
}

// A bare <video> shows nothing until it has a frame to paint. Seeking a hair
// into the clip once metadata loads is enough to get a real frame for free,
// without pulling in a canvas-based frame-grab. The play badge + duration
// are what actually distinguish this from a photo thumbnail at a glance.
function VideoThumb({ src }: { src: string }) {
    const ref = useRef<HTMLVideoElement>(null);
    const [duration, setDuration] = useState<number | null>(null);

    useEffect(() => {
        const v = ref.current;
        if (!v) return;
        const onLoaded = () => {
            try {
                v.currentTime = Math.min(0.1, v.duration || 0);
            } catch {
                // duration not ready yet on some browsers — thumbnail just stays blank
            }
            if (Number.isFinite(v.duration)) setDuration(v.duration);
        };
        v.addEventListener("loadeddata", onLoaded);
        return () => v.removeEventListener("loadeddata", onLoaded);
    }, []);

    return (
        <div className="relative h-12 w-12 bg-foreground">
            <video
                ref={ref}
                src={src}
                muted
                playsInline
                preload="metadata"
                className="h-full w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-0 bg-black/25" />
            <Play className="pointer-events-none absolute inset-0 m-auto h-4 w-4 fill-white text-white drop-shadow" />
            {duration != null && (
                <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-medium leading-tight text-white">
                    {formatDuration(duration)}
                </span>
            )}
        </div>
    );
}

function FilePickerChip({
    id,
    icon,
    label,
    accept,
    onFiles,
}: {
    id: string;
    icon: React.ReactNode;
    label: string;
    accept: string;
    onFiles: (files: File[]) => void;
}) {
    return (
        <label
            htmlFor={id}
            // Stop the click here — this bar's own onClick opens the general
            // file dialog, and without this a chip click would bubble up and
            // open both.
            onClick={(e) => e.stopPropagation()}
            className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
            <span className="text-primary">{icon}</span>
            {label}
            <input
                id={id}
                type="file"
                accept={accept}
                multiple
                className="hidden"
                onChange={(e) => {
                    onFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                }}
            />
        </label>
    );
}
