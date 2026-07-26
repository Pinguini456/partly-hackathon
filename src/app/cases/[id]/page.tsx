"use client";

// The case hub. Everything about one job lives here — deliberately not split
// across a separate "tracking" area: you click a case, you get the whole job.
//
// Layout, and why: the things a mechanic works *from* — what the job is, how
// far along it is, the task list, their own notes — are always on screen. The
// things they consult are grouped into tabs. Putting the job list behind a tab
// would mean the one list they tick through all day needs a click to reach,
// and a page that's mostly boxes hides how much is actually here.

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft,
    FileText,
    Plus,
    User,
    Phone,
    Package,
    ShoppingCart,
    Quote,
    ShieldCheck,
    Check,
    X,
    ListChecks,
    Sparkles,
    Search,
    Trash2,
    MessageCircle,
    Loader2,
    ArrowRight,
} from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Input } from "@/src/components/ui/input";
import { Separator } from "@/src/components/ui/separator";
import { CaseTimeline, TimelinePart, ManualStage } from "@/src/components/CaseTimeline";
import { CaseChat } from "@/src/components/CaseChat";
import { vehicleLabel, vehiclePlate } from "@/src/lib/vehicles";
import { isHeroCase } from "@/src/lib/heroCase";
import { LIFECYCLE, progressOf, stageIndex, customerMessageFor, firstNameOf } from "@/src/lib/caseProgress";
import {
    Intake,
    Todo,
    TodoStatus,
    CustomerMessage,
    parseIntake,
    serialiseIntake,
    hasInsurance,
    splitTodos,
    makeTodoId,
} from "@/src/lib/intake";

type CaseFile = { id: string; filename: string; url: string; created_at: string };
type Note = { text: string; at: string };
type CaseParts = { id: string[]; name: string[]; image: string[]; freeform?: boolean };
type BasketLine = {
    id: string;
    name: string;
    supplier: string;
    price: number;
    eta: string;
    originalEta: string;
};
type Basket = { label: string; total: number; lines: BasketLine[]; placedAt?: string };

type CaseRecord = {
    id: string;
    status: string;
    vehicle_slug: string | null;
    customer_name: string | null;
    customer_contact: string | null;
    transcript: string | null;
    summary: string | null;
    notes: Note[] | null;
    parts: CaseParts | null;
    basket: Basket | null;
    created_at: string;
};

type SearchResult = { id: string; name: string; mpn?: string };
type TabKey = "parts" | "customer" | "order" | "transcripts";

/** A UUID is unusable over the phone — six characters of it isn't. */
function caseNumber(id: string) {
    return `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export default function CaseDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [data, setData] = useState<{ case: CaseRecord; files: CaseFile[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tab, setTab] = useState<TabKey>("parts");

    const [noteText, setNoteText] = useState("");
    const [addingNote, setAddingNote] = useState(false);
    const [intake, setIntake] = useState<Intake | null>(null);
    const [todoText, setTodoText] = useState("");

    const [partQuery, setPartQuery] = useState("");
    const [partResults, setPartResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingPartId, setAddingPartId] = useState<string | null>(null);
    const [showPartSearch, setShowPartSearch] = useState(false);

    const [heroImage, setHeroImage] = useState<string | null>(null);
    const [advancing, setAdvancing] = useState(false);
    const [whichTranscript, setWhichTranscript] = useState<"technician" | "customer">("technician");

    const load = useCallback(async () => {
        const res = await fetch(`/api/cases/${params.id}`);
        const json = await res.json();
        if (!res.ok) {
            setError(json.error ?? "Case not found");
            return;
        }
        setData(json);
        setIntake(parseIntake(json.case?.summary));
    }, [params.id]);

    useEffect(() => {
        load();
    }, [load]);

    async function persistIntake(next: Intake) {
        setIntake(next);
        await fetch(`/api/cases/${params.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ summary: serialiseIntake(next) }),
        }).catch(() => {});
    }

    function updateTodos(mutate: (todos: Todo[]) => Todo[]) {
        if (!intake) return;
        persistIntake({ ...intake, todos: mutate(intake.todos ?? []) });
    }

    const setTodoStatus = (id: string, status: TodoStatus) =>
        updateTodos((todos) => todos.map((t) => (t.id === id ? { ...t, status } : t)));

    /** Dismissing a suggestion removes it outright — it was never a job. */
    const dismissTodo = (id: string) => updateTodos((todos) => todos.filter((t) => t.id !== id));

    function addTodo() {
        if (!todoText.trim()) return;
        updateTodos((todos) => [
            ...todos,
            {
                id: makeTodoId(),
                task: todoText.trim(),
                status: "accepted",
                source: "mechanic",
                addedAt: new Date().toISOString(),
            },
        ]);
        setTodoText("");
    }

    /** Every message the customer gets is kept on the case, not just shown once. */
    function sendMessage(text: string, stage: string) {
        if (!intake) return;
        const message: CustomerMessage = { text, at: new Date().toISOString(), stage };
        persistIntake({ ...intake, messages: [...(intake.messages ?? []), message] });
    }

    async function addNote() {
        if (!noteText.trim()) return;
        setAddingNote(true);
        try {
            await fetch(`/api/cases/${params.id}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: noteText }),
            });
            setNoteText("");
            await load();
        } finally {
            setAddingNote(false);
        }
    }

    async function patchCase(body: Record<string, unknown>) {
        await fetch(`/api/cases/${params.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
    }

    /** Moving the job on is the one action that also talks to the customer. */
    async function advanceStage() {
        if (!data || advancing) return;
        const next = LIFECYCLE[stageIndex(data.case.status) + 1];
        if (!next) return;

        setAdvancing(true);
        try {
            await patchCase({ status: next.key });
            const text = customerMessageFor(next.key, firstNameOf(data.case.customer_name));
            if (text) sendMessage(text, next.key);
            await load();
        } finally {
            setAdvancing(false);
        }
    }

    async function searchParts(q: string) {
        setPartQuery(q);
        if (q.trim().length < 2 || !data?.case.vehicle_slug) {
            setPartResults([]);
            return;
        }
        setSearching(true);
        try {
            const res = await fetch(
                `/api/catalogue?slug=${encodeURIComponent(data.case.vehicle_slug)}&q=${encodeURIComponent(q)}`,
            );
            const json = await res.json();
            setPartResults(json.results ?? []);
        } catch {
            setPartResults([]);
        } finally {
            setSearching(false);
        }
    }

    async function addPart(result: SearchResult) {
        if (!data) return;
        const parts = data.case.parts ?? { id: [], name: [], image: [] };
        if (parts.id.includes(result.id)) return;

        setAddingPartId(result.id);
        try {
            // Render the same highlighted diagram the model's own matches get,
            // so a hand-added part doesn't look like a lesser kind of row.
            let image = "";
            try {
                const res = await fetch("/api/catalogue", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ slug: data.case.vehicle_slug, id: result.id }),
                });
                image = (await res.json()).image ?? "";
            } catch {
                // Diagram is a nicety; the part itself still belongs on the list.
            }

            await patchCase({
                parts: {
                    ...parts,
                    id: [...parts.id, result.id],
                    name: [...parts.name, result.name],
                    image: [...parts.image, image],
                },
            });
            setPartQuery("");
            setPartResults([]);
            await load();
        } finally {
            setAddingPartId(null);
        }
    }

    async function removePart(index: number) {
        if (!data?.case.parts) return;
        const p = data.case.parts;
        await patchCase({
            parts: {
                ...p,
                id: p.id.filter((_, i) => i !== index),
                name: p.name.filter((_, i) => i !== index),
                image: p.image.filter((_, i) => i !== index),
            },
        });
        await load();
    }

    if (error) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
                <div>
                    <p className="text-muted-foreground">{error}</p>
                    <Button size="lg" onClick={() => router.push("/cases")} className="mt-6">
                        Back to cases
                    </Button>
                </div>
            </main>
        );
    }

    if (!data) return null;

    const { case: c, files } = data;
    const photos = files.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.filename));
    const videos = files.filter((f) => /\.(mp4|mov|webm)$/i.test(f.filename));
    const notes = c.notes ?? [];
    const hasParts = Boolean(c.parts?.id?.length);
    const basket = c.basket;
    const plate = vehiclePlate(c.vehicle_slug);

    const problems = intake?.problems ?? [];
    const todos = intake?.todos ?? [];
    const { suggested, active, done } = splitTodos(todos);
    const insurance = intake?.insurance;
    const messages = intake?.messages ?? [];

    const progress = progressOf(c.status);
    const nextStage = LIFECYCLE[progress.index + 1];
    // Once parts are on order, editing the identified list would leave the
    // basket pointing at parts that aren't on the job any more.
    const partsEditable = !basket;

    const timelineParts: TimelinePart[] =
        basket?.lines?.map((l) => ({
            id: l.id,
            name: l.name,
            eta: l.eta,
            originalEta: l.originalEta,
        })) ?? [];

    const displayHero = heroImage ?? photos[0]?.url ?? null;
    const hasTranscripts = Boolean(c.transcript || intake?.interviewTranscript);

    const TABS: { key: TabKey; label: string; count?: number; hidden?: boolean }[] = [
        { key: "parts", label: "Parts", count: c.parts?.id.length },
        { key: "customer", label: "Customer", count: problems.length + messages.length || undefined },
        { key: "order", label: "Order & delivery", hidden: !basket },
        { key: "transcripts", label: "Transcripts", hidden: !hasTranscripts },
    ];
    const visibleTabs = TABS.filter((t) => !t.hidden);
    const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : "parts";

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-6 py-6 lg:px-8">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/cases")}
                    className="mb-3 -ml-2 text-muted-foreground"
                >
                    <ArrowLeft />
                    All cases
                </Button>

                {/* Identity + progress, no card around it — this is the page's
                    subject, not one more item on it. */}
                <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-muted-foreground">
                                {caseNumber(c.id)}
                            </span>
                            {hasInsurance(insurance) && (
                                <Badge variant="outline" className="gap-1">
                                    <ShieldCheck className="h-3 w-3" />
                                    {insurance?.insurer || "Insured"}
                                </Badge>
                            )}
                        </div>
                        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">
                            {vehicleLabel(c.vehicle_slug)}
                        </h1>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                            {plate && (
                                <span className="rounded border px-1.5 py-0.5 font-mono text-xs font-semibold tracking-wider text-foreground">
                                    {plate}
                                </span>
                            )}
                            <span className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5" />
                                <span className="font-medium text-foreground">
                                    {c.customer_name || "No name on file"}
                                </span>
                            </span>
                            {c.customer_contact && (
                                <span className="flex items-center gap-1.5">
                                    <Phone className="h-3.5 w-3.5" />
                                    {c.customer_contact}
                                </span>
                            )}
                            <span>Opened {new Date(c.created_at).toLocaleDateString("en-NZ")}</span>
                        </div>
                    </div>

                    {/* Thin progress — a line and a label, not a panel. */}
                    <div className="w-full max-w-sm">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-sm font-medium text-foreground">
                                {progress.stage.label}
                            </span>
                            <span className="text-xs text-muted-foreground">
                                {progress.index + 1} of {progress.total}
                            </span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-secondary">
                            <div
                                className="h-full rounded-full bg-primary transition-all duration-500"
                                style={{ width: `${progress.percent}%` }}
                            />
                        </div>
                        {nextStage && (
                            <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="text-xs text-muted-foreground">
                                    Texts {firstNameOf(c.customer_name)} automatically
                                </span>
                                <Button onClick={advanceStage} disabled={advancing} size="xs">
                                    {advancing ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                                    {nextStage.short}
                                </Button>
                            </div>
                        )}
                    </div>
                </div>

                {/* The car, so you know at a glance you opened the right job. */}
                {displayHero && (
                    <div className="mt-5 flex gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={displayHero}
                            alt="Vehicle"
                            className="aspect-[16/6] min-w-0 flex-1 rounded-xl border object-cover"
                        />
                        {(photos.length > 1 || videos.length > 0) && (
                            <div className="flex w-24 shrink-0 flex-col gap-2 overflow-y-auto">
                                {photos.map((f) => (
                                    <button
                                        key={f.id}
                                        onClick={() => setHeroImage(f.url)}
                                        aria-label={`Show ${f.filename}`}
                                        className={`shrink-0 overflow-hidden rounded-lg border transition ${
                                            displayHero === f.url
                                                ? "ring-2 ring-primary"
                                                : "opacity-70 hover:opacity-100"
                                        }`}
                                    >
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={f.url} alt={f.filename} className="h-14 w-full object-cover" />
                                    </button>
                                ))}
                                {videos.map((f) => (
                                    <video key={f.id} src={f.url} controls className="w-full rounded-lg border" />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
                    {/* Main column — tabs for the things you consult. */}
                    <div className="min-w-0">
                        <div className="flex gap-1 border-b">
                            {visibleTabs.map((t) => (
                                <button
                                    key={t.key}
                                    onClick={() => setTab(t.key)}
                                    className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                                        activeTab === t.key
                                            ? "border-primary text-foreground"
                                            : "border-transparent text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {t.label}
                                    {t.count != null && (
                                        <span className="rounded-full bg-secondary px-1.5 text-[10px] text-secondary-foreground">
                                            {t.count}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        <div className="pt-5">
                            {activeTab === "parts" && (
                                <div>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm text-muted-foreground">
                                            {partsEditable
                                                ? "Review what the model found — drop anything wrong, add anything it missed."
                                                : "Locked: these parts are on order."}
                                        </p>
                                        {hasParts && (
                                            <Button onClick={() => router.push(`/parts?case=${c.id}`)} size="sm">
                                                <ShoppingCart />
                                                {basket ? "Change parts" : "Compare parts & suppliers"}
                                            </Button>
                                        )}
                                    </div>

                                    {c.parts?.freeform && (
                                        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            No OEM catalogue for this vehicle — these were read straight off
                                            the technician&apos;s notes, so there are no part numbers or
                                            diagrams yet.
                                        </p>
                                    )}
                                    {isHeroCase(c.vehicle_slug) && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            Matched against the full OEM catalogue, with the damage
                                            model&apos;s own confidence and supplier delivery history on each
                                            part.
                                        </p>
                                    )}

                                    {!hasParts && (
                                        <p className="mt-4 text-sm text-muted-foreground">
                                            No parts identified for this case yet.
                                        </p>
                                    )}

                                    <ul className="mt-4 space-y-2">
                                        {c.parts?.name.map((name, i) => (
                                            <li
                                                key={`${c.parts!.id[i]}-${i}`}
                                                className="flex items-center gap-3 rounded-lg border p-3 text-sm text-foreground"
                                            >
                                                {c.parts!.image[i] ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={c.parts!.image[i]}
                                                        alt={name}
                                                        className="h-12 w-12 shrink-0 rounded object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                                                        <Package className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <span className="min-w-0 flex-1">{name}</span>
                                                {basket?.lines?.find((l) => l.id === c.parts!.id[i]) && (
                                                    <Badge variant="outline" className="shrink-0">
                                                        {basket.lines.find((l) => l.id === c.parts!.id[i])!.supplier}
                                                    </Badge>
                                                )}
                                                {partsEditable && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon-xs"
                                                        onClick={() => removePart(i)}
                                                        aria-label={`Remove ${name}`}
                                                        className="shrink-0 rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                                    >
                                                        <Trash2 />
                                                    </Button>
                                                )}
                                            </li>
                                        ))}
                                    </ul>

                                    {partsEditable && c.vehicle_slug && !c.parts?.freeform && (
                                        <div className="mt-4">
                                            {!showPartSearch ? (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => setShowPartSearch(true)}
                                                >
                                                    <Plus />
                                                    Add a part
                                                </Button>
                                            ) : (
                                                <div className="rounded-lg border p-3">
                                                    <div className="flex items-center gap-2">
                                                        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                        <Input
                                                            autoFocus
                                                            value={partQuery}
                                                            onChange={(e) => searchParts(e.target.value)}
                                                            placeholder="Search this vehicle's catalogue…"
                                                        />
                                                        <Button
                                                            variant="ghost"
                                                            size="icon-xs"
                                                            aria-label="Close search"
                                                            onClick={() => {
                                                                setShowPartSearch(false);
                                                                setPartQuery("");
                                                                setPartResults([]);
                                                            }}
                                                        >
                                                            <X />
                                                        </Button>
                                                    </div>
                                                    <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                                                        Real OEM catalogue for this vehicle — added parts carry
                                                        their part number and diagram.
                                                    </p>

                                                    {searching && (
                                                        <p className="mt-3 pl-6 text-xs text-muted-foreground">
                                                            Searching…
                                                        </p>
                                                    )}
                                                    {!searching && partQuery.trim().length >= 2 && (
                                                        <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                                                            {partResults.length === 0 && (
                                                                <li className="pl-6 text-xs text-muted-foreground">
                                                                    Nothing matching “{partQuery}”.
                                                                </li>
                                                            )}
                                                            {partResults.map((r) => {
                                                                const already = c.parts?.id.includes(r.id);
                                                                return (
                                                                    <li
                                                                        key={r.id}
                                                                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted"
                                                                    >
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="truncate text-sm text-foreground">
                                                                                {r.name}
                                                                            </p>
                                                                            {r.mpn && (
                                                                                <p className="truncate font-mono text-[10px] text-muted-foreground">
                                                                                    {r.mpn}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <Button
                                                                            size="xs"
                                                                            variant={already ? "ghost" : "default"}
                                                                            disabled={already || addingPartId === r.id}
                                                                            onClick={() => addPart(r)}
                                                                        >
                                                                            {addingPartId === r.id ? (
                                                                                <Loader2 className="animate-spin" />
                                                                            ) : already ? (
                                                                                "On job"
                                                                            ) : (
                                                                                "Add"
                                                                            )}
                                                                        </Button>
                                                                    </li>
                                                                );
                                                            })}
                                                        </ul>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {activeTab === "customer" && (
                                <div className="space-y-6">
                                    <div>
                                        <h3 className="text-sm font-semibold text-foreground">
                                            What they reported
                                        </h3>
                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                            From the conversation at drop-off, in their words.
                                        </p>
                                        {problems.length === 0 ? (
                                            <p className="mt-3 text-sm text-muted-foreground">
                                                Nothing captured from the customer for this job.
                                            </p>
                                        ) : (
                                            <ul className="mt-3 space-y-2">
                                                {problems.map((p, i) => (
                                                    <li key={i} className="rounded-lg border p-3">
                                                        <p className="text-sm font-medium text-foreground">
                                                            {p.summary}
                                                        </p>
                                                        <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">
                                                            &ldquo;{p.quote}&rdquo;
                                                        </p>
                                                    </li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>

                                    <Separator />

                                    <div>
                                        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            <MessageCircle className="h-4 w-4 text-primary" />
                                            Updates sent
                                        </h3>
                                        {messages.length === 0 ? (
                                            <p className="mt-3 text-sm text-muted-foreground">
                                                Nothing sent yet — moving the job to its next stage texts them
                                                automatically.
                                            </p>
                                        ) : (
                                            <div className="mt-3 space-y-2">
                                                {messages.map((m, i) => (
                                                    <div key={i} className="flex justify-end">
                                                        <div className="max-w-[85%]">
                                                            <div className="rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                                                                {m.text}
                                                            </div>
                                                            <div className="mt-1 text-right text-[10px] text-muted-foreground">
                                                                Delivered {new Date(m.at).toLocaleString("en-NZ")}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {hasInsurance(insurance) && (
                                        <>
                                            <Separator />
                                            <div>
                                                <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                                    Insurance
                                                </h3>
                                                <dl className="mt-3 space-y-2 text-sm">
                                                    {insurance?.insurer && (
                                                        <InsuranceRow label="Insurer" value={insurance.insurer} />
                                                    )}
                                                    {insurance?.policyNumber && (
                                                        <InsuranceRow label="Policy" value={insurance.policyNumber} />
                                                    )}
                                                    {insurance?.claimNumber && (
                                                        <InsuranceRow label="Claim" value={insurance.claimNumber} />
                                                    )}
                                                    {insurance?.excess && (
                                                        <InsuranceRow label="Excess" value={insurance.excess} />
                                                    )}
                                                </dl>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === "order" && basket && (
                                <div className="space-y-6">
                                    <div>
                                        <div className="flex items-baseline justify-between gap-3">
                                            <h3 className="text-sm font-semibold text-foreground">Order</h3>
                                            <span className="text-xl font-bold text-foreground">
                                                ${basket.total}
                                            </span>
                                        </div>
                                        <p className="mt-0.5 text-xs text-muted-foreground">{basket.label}</p>
                                        <div className="mt-3 space-y-2">
                                            {basket.lines.map((l) => (
                                                <div
                                                    key={l.id}
                                                    className="flex items-center justify-between gap-3 text-sm"
                                                >
                                                    <span className="text-foreground">{l.name}</span>
                                                    <span className="shrink-0 text-muted-foreground">
                                                        {l.supplier} · ${l.price}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {timelineParts.length > 0 && (
                                        <>
                                            <Separator />
                                            <CaseTimeline
                                                orderedParts={timelineParts}
                                                customerName={c.customer_name}
                                                initialStage={
                                                    (["parts_arrived", "in_bay", "ready"] as string[]).includes(
                                                        c.status,
                                                    )
                                                        ? (c.status as ManualStage)
                                                        : undefined
                                                }
                                                messages={messages}
                                                onSendMessage={sendMessage}
                                                hideStageControls
                                            />
                                        </>
                                    )}
                                </div>
                            )}

                            {activeTab === "transcripts" && (
                                <div>
                                    <div className="flex gap-1 rounded-lg border p-1">
                                        {(
                                            [
                                                ["technician", "Technician inspection", Boolean(c.transcript)],
                                                [
                                                    "customer",
                                                    "Customer conversation",
                                                    Boolean(intake?.interviewTranscript),
                                                ],
                                            ] as [typeof whichTranscript, string, boolean][]
                                        )
                                            .filter(([, , exists]) => exists)
                                            .map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    onClick={() => setWhichTranscript(key)}
                                                    className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                                                        whichTranscript === key
                                                            ? "bg-secondary text-foreground"
                                                            : "text-muted-foreground hover:text-foreground"
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            ))}
                                    </div>

                                    <div className="mt-4 flex items-start gap-2">
                                        <Quote className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                                        <p className="text-sm leading-relaxed text-foreground">
                                            {whichTranscript === "technician"
                                                ? c.transcript || "No technician walkaround recorded."
                                                : intake?.interviewTranscript ||
                                                  "No customer conversation recorded."}
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Sidebar — what a mechanic works from, never behind a tab. */}
                    <aside className="space-y-4">
                        <Card>
                            <CardContent>
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <ListChecks className="h-4 w-4 text-primary" />
                                    Job list
                                    {active.length > 0 && (
                                        <Badge variant="secondary" className="ml-auto">
                                            {active.length}
                                        </Badge>
                                    )}
                                </h2>

                                {suggested.length > 0 && (
                                    <div className="mt-3 rounded-lg border border-primary/40 bg-accent/40 p-2.5">
                                        <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                                            <Sparkles className="h-3 w-3 text-primary" />
                                            Suggested from the customer
                                        </p>
                                        <ul className="mt-2 space-y-2">
                                            {suggested.map((t) => (
                                                <li key={t.id} className="rounded-lg border bg-card p-2.5">
                                                    <p className="text-sm font-medium text-foreground">{t.task}</p>
                                                    {t.reason && (
                                                        <p className="mt-0.5 text-xs text-muted-foreground">
                                                            {t.reason}
                                                        </p>
                                                    )}
                                                    <div className="mt-2 flex gap-1.5">
                                                        <Button
                                                            size="xs"
                                                            onClick={() => setTodoStatus(t.id, "accepted")}
                                                        >
                                                            <Check />
                                                            Add
                                                        </Button>
                                                        <Button
                                                            size="xs"
                                                            variant="ghost"
                                                            onClick={() => dismissTodo(t.id)}
                                                        >
                                                            <X />
                                                        </Button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                <div className="mt-3 space-y-1.5">
                                    {active.length === 0 && done.length === 0 && (
                                        <p className="text-sm text-muted-foreground">No jobs yet.</p>
                                    )}
                                    {active.map((t) => (
                                        <TodoRow key={t.id} todo={t} onToggle={() => setTodoStatus(t.id, "done")} />
                                    ))}
                                    {done.map((t) => (
                                        <TodoRow
                                            key={t.id}
                                            todo={t}
                                            done
                                            onToggle={() => setTodoStatus(t.id, "accepted")}
                                        />
                                    ))}
                                </div>

                                <div className="mt-3 flex gap-2">
                                    <Input
                                        value={todoText}
                                        onChange={(e) => setTodoText(e.target.value)}
                                        placeholder="Add a job…"
                                        onKeyDown={(e) => e.key === "Enter" && addTodo()}
                                    />
                                    <Button
                                        onClick={addTodo}
                                        disabled={!todoText.trim()}
                                        size="icon"
                                        aria-label="Add job"
                                    >
                                        <Plus />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent>
                                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                    <FileText className="h-4 w-4 text-primary" />
                                    Mechanic notes
                                </h2>
                                <div className="mt-3 space-y-1.5">
                                    {notes.length === 0 && (
                                        <p className="text-sm text-muted-foreground">
                                            Findings get added as the job goes.
                                        </p>
                                    )}
                                    {notes.map((n, i) => (
                                        <div
                                            key={i}
                                            className="rounded-lg bg-muted px-2.5 py-2 text-sm text-foreground"
                                        >
                                            <p>{n.text}</p>
                                            <p className="mt-1 text-[10px] text-muted-foreground">
                                                {new Date(n.at).toLocaleString("en-NZ")}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <Input
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        placeholder="Add a finding…"
                                        onKeyDown={(e) => e.key === "Enter" && addNote()}
                                    />
                                    <Button
                                        onClick={addNote}
                                        disabled={addingNote || !noteText.trim()}
                                        size="icon"
                                        aria-label="Add note"
                                    >
                                        <Plus />
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </aside>
                </div>
            </div>

            <CaseChat caseId={c.id} customerName={c.customer_name} />
        </main>
    );
}

function TodoRow({ todo, done, onToggle }: { todo: Todo; done?: boolean; onToggle: () => void }) {
    return (
        <div className={`flex items-start gap-2.5 rounded-lg border p-2.5 ${done ? "bg-muted/50" : ""}`}>
            <button
                onClick={onToggle}
                aria-label={done ? `Reopen ${todo.task}` : `Complete ${todo.task}`}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    done ? "border-green-600 bg-green-600 text-white" : "hover:border-primary"
                }`}
            >
                {done && <Check className="h-3 w-3" />}
            </button>
            <p
                className={`min-w-0 flex-1 text-sm ${
                    done ? "text-muted-foreground line-through" : "text-foreground"
                }`}
            >
                {todo.task}
            </p>
            {todo.source === "ai" && (
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-primary" aria-label="from interview" />
            )}
        </div>
    );
}

function InsuranceRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="truncate font-medium text-foreground">{value}</dd>
        </div>
    );
}
