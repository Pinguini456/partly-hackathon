"use client";

// The case hub. Everything about one job lives here — who it belongs to,
// what the model heard and identified, the basket they bought, the live
// schedule, and the running record. Deliberately not split across a separate
// "tracking" area: you click a case, you get the whole job.
//
// Structured as one page of collapsible sections rather than tabs, so the
// whole job is legible at a glance and nothing important is hidden behind a
// click — the sections that get noisy once a job is underway (the schedule,
// the order, the transcripts) start folded instead.

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
    MessageSquareWarning,
    Check,
    X,
    ListChecks,
    Sparkles,
    ChevronDown,
    Search,
    Trash2,
    CalendarClock,
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
import { vehicleLabel, vehiclePlate } from "@/src/lib/vehicles";
import { isHeroCase } from "@/src/lib/heroCase";
import {
    LIFECYCLE,
    LifecycleKey,
    progressOf,
    stageIndex,
    customerMessageFor,
    firstNameOf,
} from "@/src/lib/caseProgress";
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

/** A UUID is unusable over the phone — six characters of it isn't. */
function caseNumber(id: string) {
    return `#${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

export default function CaseDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [data, setData] = useState<{ case: CaseRecord; files: CaseFile[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [noteText, setNoteText] = useState("");
    const [addingNote, setAddingNote] = useState(false);

    const [intake, setIntake] = useState<Intake | null>(null);
    const [todoText, setTodoText] = useState("");

    // Parts review
    const [partQuery, setPartQuery] = useState("");
    const [partResults, setPartResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [addingPartId, setAddingPartId] = useState<string | null>(null);
    const [showPartSearch, setShowPartSearch] = useState(false);

    const [heroImage, setHeroImage] = useState<string | null>(null);
    const [advancing, setAdvancing] = useState(false);

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

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-4xl px-6 py-8 sm:px-8">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/cases")}
                    className="mb-4 -ml-2 text-muted-foreground"
                >
                    <ArrowLeft />
                    All cases
                </Button>

                {/* Identity block — whose car, which car, which job. */}
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-medium text-muted-foreground">
                                {caseNumber(c.id)}
                            </span>
                            <Badge variant="secondary">{progress.stage.label}</Badge>
                        </div>
                        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight text-foreground">
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
                            <span>
                                Opened {new Date(c.created_at).toLocaleDateString("en-NZ")}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Hero image + strip. Seeing the car is how you know at a
                    glance you've opened the right job. */}
                {displayHero && (
                    <div className="mt-5">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={displayHero}
                            alt="Vehicle"
                            className="aspect-[16/7] w-full rounded-xl border object-cover"
                        />
                        {(photos.length > 1 || videos.length > 0) && (
                            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
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
                                        <img
                                            src={f.url}
                                            alt={f.filename}
                                            className="h-16 w-24 object-cover"
                                        />
                                    </button>
                                ))}
                                {videos.map((f) => (
                                    <video
                                        key={f.id}
                                        src={f.url}
                                        controls
                                        className="h-16 shrink-0 rounded-lg border"
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Progress across the whole job, not just after ordering. */}
                <Card className="mt-6">
                    <CardContent>
                        <div className="flex flex-wrap items-end justify-between gap-3">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    Progress
                                </p>
                                <p className="mt-0.5 text-lg font-semibold text-foreground">
                                    {progress.stage.label}
                                </p>
                            </div>
                            {nextStage && (
                                <Button onClick={advanceStage} disabled={advancing} size="sm">
                                    {advancing ? <Loader2 className="animate-spin" /> : <ArrowRight />}
                                    Mark {nextStage.label.toLowerCase()}
                                </Button>
                            )}
                        </div>

                        <div className="mt-4">
                            <div className="h-2 overflow-hidden rounded-full bg-secondary">
                                <div
                                    className="h-full rounded-full bg-primary transition-all duration-500"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                            <div className="mt-2 flex justify-between gap-1">
                                {LIFECYCLE.map((s, i) => (
                                    <span
                                        key={s.key}
                                        className={`text-[10px] sm:text-xs ${
                                            i <= progress.index
                                                ? "font-medium text-foreground"
                                                : "text-muted-foreground"
                                        }`}
                                    >
                                        {s.short}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {nextStage && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                Moving to the next stage texts {firstNameOf(c.customer_name)}{" "}
                                automatically.
                            </p>
                        )}
                    </CardContent>
                </Card>

                <div className="mt-6 space-y-4">
                    {/* Identified parts — the mechanic's review surface. */}
                    <Section
                        title="Identified parts"
                        icon={<Package className="h-4 w-4 text-primary" />}
                        badge={hasParts ? `${c.parts!.id.length}` : undefined}
                        defaultOpen
                    >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">
                                {partsEditable
                                    ? "Review what the model found — remove anything wrong, add anything it missed."
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
                                No OEM catalogue for this vehicle — these were read straight off the
                                technician&apos;s notes, so there are no part numbers or diagrams yet.
                            </p>
                        )}
                        {isHeroCase(c.vehicle_slug) && (
                            <p className="mt-3 text-xs text-muted-foreground">
                                Matched against the full OEM catalogue, with the damage model&apos;s
                                own confidence and supplier delivery history on each part.
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
                                            {
                                                basket.lines.find((l) => l.id === c.parts!.id[i])!
                                                    .supplier
                                            }
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
                                            Searches the real OEM catalogue for this vehicle — added
                                            parts carry their part number and diagram.
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
                                                                disabled={
                                                                    already || addingPartId === r.id
                                                                }
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
                    </Section>

                    {/* Job list */}
                    {(todos.length > 0 || problems.length > 0) && (
                        <Section
                            title="Job list"
                            icon={<ListChecks className="h-4 w-4 text-primary" />}
                            badge={active.length ? `${active.length}` : undefined}
                            defaultOpen
                        >
                            {suggested.length > 0 && (
                                <div className="rounded-lg border border-primary/40 bg-accent/40 p-3">
                                    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                                        Suggested from what the customer said
                                    </p>
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                        Nothing here is on the job until you accept it.
                                    </p>
                                    <ul className="mt-3 space-y-2">
                                        {suggested.map((t) => (
                                            <li key={t.id} className="rounded-lg border bg-card p-3">
                                                <p className="text-sm font-medium text-foreground">
                                                    {t.task}
                                                </p>
                                                {t.reason && (
                                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                                        {t.reason}
                                                    </p>
                                                )}
                                                {t.fromQuote && (
                                                    <p className="mt-1 border-l-2 pl-2 text-xs italic text-muted-foreground">
                                                        &ldquo;{t.fromQuote}&rdquo;
                                                    </p>
                                                )}
                                                <div className="mt-2 flex gap-2">
                                                    <Button
                                                        size="xs"
                                                        onClick={() => setTodoStatus(t.id, "accepted")}
                                                    >
                                                        <Check />
                                                        Add to job
                                                    </Button>
                                                    <Button
                                                        size="xs"
                                                        variant="ghost"
                                                        onClick={() => dismissTodo(t.id)}
                                                    >
                                                        <X />
                                                        Dismiss
                                                    </Button>
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            <div className="mt-4 space-y-2">
                                {active.length === 0 && done.length === 0 && (
                                    <p className="text-sm text-muted-foreground">
                                        No jobs on the list yet.
                                    </p>
                                )}
                                {active.map((t) => (
                                    <TodoRow
                                        key={t.id}
                                        todo={t}
                                        onToggle={() => setTodoStatus(t.id, "done")}
                                    />
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

                            <div className="mt-4 flex gap-2">
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
                        </Section>
                    )}

                    {/* What the customer said, verbatim beside the reading of it. */}
                    {problems.length > 0 && (
                        <Section
                            title="Customer reported"
                            icon={<MessageSquareWarning className="h-4 w-4 text-primary" />}
                            badge={`${problems.length}`}
                        >
                            <p className="text-xs text-muted-foreground">
                                From the drop-off conversation, in their words.
                            </p>
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
                        </Section>
                    )}

                    {/* Messages actually sent. */}
                    <Section
                        title="Customer updates"
                        icon={<MessageCircle className="h-4 w-4 text-primary" />}
                        badge={messages.length ? `${messages.length}` : undefined}
                    >
                        {messages.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nothing sent yet — moving the job to its next stage texts the
                                customer automatically.
                            </p>
                        ) : (
                            <div className="space-y-2">
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
                    </Section>

                    {/* Schedule — folded by default; the bar above already
                        answers "how far along is this?" at a glance. */}
                    {timelineParts.length > 0 && (
                        <Section
                            title="Delivery schedule"
                            icon={<CalendarClock className="h-4 w-4 text-primary" />}
                        >
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
                        </Section>
                    )}

                    {/* Order */}
                    {basket && (
                        <Section
                            title="Order"
                            icon={<ShoppingCart className="h-4 w-4 text-primary" />}
                            badge={`$${basket.total}`}
                        >
                            <p className="text-sm text-muted-foreground">{basket.label}</p>
                            <div className="mt-4 space-y-2">
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
                            <Separator className="my-4" />
                            <div className="flex items-center justify-between">
                                <span className="font-medium text-foreground">Total</span>
                                <span className="text-xl font-bold text-foreground">
                                    ${basket.total}
                                </span>
                            </div>
                        </Section>
                    )}

                    {/* Notes */}
                    <Section
                        title="Notes"
                        icon={<FileText className="h-4 w-4 text-primary" />}
                        badge={notes.length ? `${notes.length}` : undefined}
                        defaultOpen={notes.length > 0}
                    >
                        <p className="text-xs text-muted-foreground">
                            Findings get added as the job goes — a case is a running record, not a
                            one-shot form.
                        </p>
                        <div className="mt-3 space-y-2">
                            {notes.length === 0 && (
                                <p className="text-sm text-muted-foreground">
                                    No additional notes yet.
                                </p>
                            )}
                            {notes.map((n, i) => (
                                <div
                                    key={i}
                                    className="rounded-lg bg-muted px-3 py-2 text-sm text-foreground"
                                >
                                    <p>{n.text}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        {new Date(n.at).toLocaleString("en-NZ")}
                                    </p>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex gap-2">
                            <Input
                                value={noteText}
                                onChange={(e) => setNoteText(e.target.value)}
                                placeholder="Add a finding or update…"
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
                    </Section>

                    {/* Insurance */}
                    {hasInsurance(insurance) && (
                        <Section
                            title="Insurance"
                            icon={<ShieldCheck className="h-4 w-4 text-primary" />}
                            badge={insurance?.insurer ?? undefined}
                        >
                            <dl className="space-y-2 text-sm">
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
                        </Section>
                    )}

                    {/* Transcripts */}
                    {c.transcript && (
                        <Section
                            title="Technician walkaround"
                            icon={<Quote className="h-4 w-4 text-primary" />}
                        >
                            <p className="text-sm leading-relaxed text-foreground">{c.transcript}</p>
                        </Section>
                    )}

                    {intake?.interviewTranscript && (
                        <Section
                            title="Drop-off conversation"
                            icon={<Quote className="h-4 w-4 text-primary" />}
                        >
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {intake.interviewTranscript}
                            </p>
                        </Section>
                    )}

                    {files.length === 0 && (
                        <p className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
                            <FileText className="h-4 w-4" />
                            No media stored against this case.
                        </p>
                    )}
                </div>
            </div>
        </main>
    );
}

/** A folding section. Everything on this page is one of these, so the page
 *  reads as one list of things about the job rather than a wall of cards. */
function Section({
    title,
    icon,
    badge,
    defaultOpen = false,
    children,
}: {
    title: string;
    icon?: React.ReactNode;
    badge?: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <Card>
            <CardContent className="py-0">
                <button
                    type="button"
                    onClick={() => setOpen((o) => !o)}
                    aria-expanded={open}
                    className="flex w-full items-center justify-between gap-3 py-4 text-left"
                >
                    <span className="flex items-center gap-2">
                        {icon}
                        <span className="font-semibold text-foreground">{title}</span>
                        {badge && (
                            <Badge variant="secondary" className="ml-1">
                                {badge}
                            </Badge>
                        )}
                    </span>
                    <ChevronDown
                        className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                            open ? "rotate-180" : ""
                        }`}
                    />
                </button>
                {open && <div className="pb-5">{children}</div>}
            </CardContent>
        </Card>
    );
}

function TodoRow({
    todo,
    done,
    onToggle,
}: {
    todo: Todo;
    done?: boolean;
    onToggle: () => void;
}) {
    return (
        <div className={`flex items-start gap-3 rounded-lg border p-3 ${done ? "bg-muted/50" : ""}`}>
            <button
                onClick={onToggle}
                aria-label={done ? `Reopen ${todo.task}` : `Complete ${todo.task}`}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                    done ? "border-green-600 bg-green-600 text-white" : "hover:border-primary"
                }`}
            >
                {done && <Check className="h-3 w-3" />}
            </button>
            <div className="min-w-0 flex-1">
                <p
                    className={`text-sm ${
                        done ? "text-muted-foreground line-through" : "text-foreground"
                    }`}
                >
                    {todo.task}
                </p>
                {todo.fromQuote && (
                    <p className="mt-1 truncate text-xs italic text-muted-foreground">
                        &ldquo;{todo.fromQuote}&rdquo;
                    </p>
                )}
            </div>
            <Badge variant="outline" className="shrink-0 text-[10px]">
                {todo.source === "ai" ? "from interview" : "added"}
            </Badge>
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
