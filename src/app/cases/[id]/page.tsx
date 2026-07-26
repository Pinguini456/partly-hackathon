"use client";

// The case hub. Everything about one job lives here — the media the
// repairer captured, what the model heard and identified, the basket they
// bought, the live schedule, and the running note history. Deliberately not
// split across a separate "tracking" area: you click a case, you get the
// whole job.

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
    Intake,
    Todo,
    TodoStatus,
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

const STATUS_LABELS: Record<string, string> = {
    uploaded: "Uploaded",
    analysing: "Analysing",
    parts_identified: "Parts identified",
    basket_chosen: "Parts ordered",
    damage_assessed: "Damage assessed",
    parts_ordered: "Parts ordered",
    parts_arrived: "Parts arrived",
    in_bay: "In the bay",
    ready: "Ready for pickup",
};

export default function CaseDetailPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const [data, setData] = useState<{ case: CaseRecord; files: CaseFile[] } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [noteText, setNoteText] = useState("");
    const [addingNote, setAddingNote] = useState(false);
    const [showFullTranscript, setShowFullTranscript] = useState(false);

    // Intake (insurance, interview, reported problems, job list) is held
    // locally so ticking a job off feels instant, then written back.
    const [intake, setIntake] = useState<Intake | null>(null);
    const [todoText, setTodoText] = useState("");

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

    useEffect(() => {
        load();
    }, [load]);

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

    // Stage buttons in the timeline write straight back to the case, so the
    // list view and anyone else looking at this job sees the same status.
    async function persistStage(stage: ManualStage) {
        await fetch(`/api/cases/${params.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: stage }),
        });
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

    const timelineParts: TimelinePart[] =
        basket?.lines?.map((l) => ({
            id: l.id,
            name: l.name,
            eta: l.eta,
            originalEta: l.originalEta,
        })) ?? [];

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-8 py-10">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push("/cases")}
                    className="mb-3 -ml-2 text-muted-foreground"
                >
                    <ArrowLeft />
                    All cases
                </Button>

                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground">
                            {vehicleLabel(c.vehicle_slug)}
                            {plate && (
                                <span className="ml-3 align-middle text-base font-normal text-muted-foreground">
                                    {plate}
                                </span>
                            )}
                        </h1>
                        <p className="mt-2 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                                <User className="h-3.5 w-3.5" />
                                {c.customer_name || "No name on file"}
                            </span>
                            {c.customer_contact && (
                                <span className="flex items-center gap-1">
                                    <Phone className="h-3.5 w-3.5" />
                                    {c.customer_contact}
                                </span>
                            )}
                            <span>Opened {new Date(c.created_at).toLocaleDateString("en-NZ")}</span>
                        </p>
                    </div>
                    <Badge variant="secondary" className="text-sm">
                        {STATUS_LABELS[c.status] ?? c.status.replace(/_/g, " ")}
                    </Badge>
                </div>

                {/* Live schedule sits at the top once there's an order — it's
                    the thing anyone opening an in-progress job came to see. */}
                {timelineParts.length > 0 && (
                    <section className="mt-8">
                        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Live status
                        </h2>
                        <CaseTimeline
                            orderedParts={timelineParts}
                            customerName={c.customer_name}
                            onStageChange={persistStage}
                        />
                    </section>
                )}

                <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
                    <div className="space-y-6">
                        {/* What the customer actually said. Kept verbatim next
                            to the shop's reading of it, so nobody has to take
                            the paraphrase on trust. */}
                        {problems.length > 0 && (
                            <Card>
                                <CardContent>
                                    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                                        <MessageSquareWarning className="h-4 w-4 text-primary" />
                                        Customer reported
                                    </h2>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                        From the drop-off conversation, in their words.
                                    </p>
                                    <ul className="mt-4 space-y-2">
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
                                </CardContent>
                            </Card>
                        )}

                        {/* Job list. Suggestions are held apart from accepted
                            work on purpose — an inference off a phone call is
                            a prompt to look, not an instruction to fix. */}
                        {(todos.length > 0 || problems.length > 0) && (
                            <Card>
                                <CardContent>
                                    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                                        <ListChecks className="h-4 w-4 text-primary" />
                                        Job list
                                    </h2>

                                    {suggested.length > 0 && (
                                        <div className="mt-4 rounded-lg border border-primary/40 bg-accent/40 p-3">
                                            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                                <Sparkles className="h-3.5 w-3.5 text-primary" />
                                                Suggested from what the customer said
                                            </p>
                                            <p className="mt-0.5 text-xs text-muted-foreground">
                                                Nothing here is on the job until you accept it.
                                            </p>
                                            <ul className="mt-3 space-y-2">
                                                {suggested.map((t) => (
                                                    <li
                                                        key={t.id}
                                                        className="rounded-lg border bg-card p-3"
                                                    >
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
                                                                onClick={() =>
                                                                    setTodoStatus(t.id, "accepted")
                                                                }
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
                                </CardContent>
                            </Card>
                        )}

                        {/* Identified parts */}
                        {hasParts && (
                            <Card>
                                <CardContent>
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h2 className="text-lg font-semibold text-foreground">
                                            Identified parts
                                        </h2>
                                        <Button
                                            onClick={() => router.push(`/parts?case=${c.id}`)}
                                            size="sm"
                                        >
                                            <ShoppingCart />
                                            {basket ? "Change parts" : "Compare parts & suppliers"}
                                        </Button>
                                    </div>

                                    {c.parts?.freeform && (
                                        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                            No OEM catalogue for this vehicle — these were read
                                            straight off the technician&apos;s notes, so there are no
                                            part numbers or diagrams yet.
                                        </p>
                                    )}
                                    {isHeroCase(c.vehicle_slug) && (
                                        <p className="mt-3 text-xs text-muted-foreground">
                                            Matched against the full OEM catalogue, with the damage
                                            model&apos;s own confidence and supplier delivery history
                                            available on each part.
                                        </p>
                                    )}

                                    <ul className="mt-4 space-y-2">
                                        {c.parts?.name.map((name, i) => (
                                            <li
                                                key={c.parts!.id[i]}
                                                className="flex items-center gap-3 rounded-lg border p-3 text-sm text-foreground"
                                            >
                                                {c.parts!.image[i] ? (
                                                    // eslint-disable-next-line @next/next/no-img-element
                                                    <img
                                                        src={c.parts!.image[i]}
                                                        alt={name}
                                                        className="h-12 w-12 rounded object-contain"
                                                    />
                                                ) : (
                                                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted">
                                                        <Package className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <span className="flex-1">{name}</span>
                                                {basket?.lines?.find((l) => l.id === c.parts!.id[i]) && (
                                                    <Badge variant="outline">
                                                        {
                                                            basket.lines.find(
                                                                (l) => l.id === c.parts!.id[i],
                                                            )!.supplier
                                                        }
                                                    </Badge>
                                                )}
                                            </li>
                                        ))}
                                    </ul>
                                </CardContent>
                            </Card>
                        )}

                        {!hasParts && (
                            <Card>
                                <CardContent className="py-8 text-center">
                                    <p className="text-muted-foreground">
                                        No parts identified for this case yet.
                                    </p>
                                    <Button onClick={() => router.push("/")} className="mt-4">
                                        Start a new intake
                                    </Button>
                                </CardContent>
                            </Card>
                        )}

                        {/* Order */}
                        {basket && (
                            <Card>
                                <CardContent>
                                    <h2 className="text-lg font-semibold text-foreground">Order</h2>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {basket.label}
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        {basket.lines.map((l) => (
                                            <div
                                                key={l.id}
                                                className="flex items-center justify-between gap-3 text-sm"
                                            >
                                                <span className="text-foreground">{l.name}</span>
                                                <span className="text-muted-foreground">
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
                                </CardContent>
                            </Card>
                        )}

                        {/* Transcript — always available in full, since it's the
                            primary record of what the repairer actually said. */}
                        {c.transcript && (
                            <Card>
                                <CardContent>
                                    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                                        <Quote className="h-4 w-4 text-primary" />
                                        Technician walkaround
                                    </h2>
                                    <p className="mt-3 text-sm leading-relaxed text-foreground">
                                        {showFullTranscript || c.transcript.length <= 260
                                            ? c.transcript
                                            : `${c.transcript.slice(0, 260)}…`}
                                    </p>
                                    {c.transcript.length > 260 && (
                                        <Button
                                            variant="link"
                                            size="sm"
                                            onClick={() => setShowFullTranscript((s) => !s)}
                                            className="mt-1 h-auto p-0"
                                        >
                                            {showFullTranscript ? "Show less" : "View full transcript"}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Right rail: media + notes */}
                    <div className="space-y-6">
                        {(photos.length > 0 || videos.length > 0) && (
                            <Card>
                                <CardContent>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Photos &amp; video
                                    </h2>
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {photos.map((f) => (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                key={f.id}
                                                src={f.url}
                                                alt={f.filename}
                                                className="aspect-square w-full rounded-lg object-cover"
                                            />
                                        ))}
                                    </div>
                                    {videos.map((f) => (
                                        <video
                                            key={f.id}
                                            src={f.url}
                                            controls
                                            className="mt-2 w-full rounded-lg"
                                        />
                                    ))}
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardContent>
                                <h2 className="text-lg font-semibold text-foreground">Notes</h2>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Findings get added as the job goes — a case is a running
                                    record, not a one-shot form.
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
                            </CardContent>
                        </Card>

                        {hasInsurance(insurance) && (
                            <Card>
                                <CardContent>
                                    <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                        Insurance
                                    </h2>
                                    <dl className="mt-3 space-y-2 text-sm">
                                        {insurance?.insurer && (
                                            <InsuranceRow label="Insurer" value={insurance.insurer} />
                                        )}
                                        {insurance?.policyNumber && (
                                            <InsuranceRow
                                                label="Policy"
                                                value={insurance.policyNumber}
                                            />
                                        )}
                                        {insurance?.claimNumber && (
                                            <InsuranceRow
                                                label="Claim"
                                                value={insurance.claimNumber}
                                            />
                                        )}
                                        {insurance?.excess && (
                                            <InsuranceRow label="Excess" value={insurance.excess} />
                                        )}
                                    </dl>
                                </CardContent>
                            </Card>
                        )}

                        {intake?.interviewTranscript && (
                            <Card>
                                <CardContent>
                                    <h2 className="text-lg font-semibold text-foreground">
                                        Drop-off conversation
                                    </h2>
                                    <p className="mt-2 max-h-56 overflow-y-auto text-sm leading-relaxed text-muted-foreground">
                                        {intake.interviewTranscript}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {files.length === 0 && (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                <FileText className="h-4 w-4" />
                                No media stored against this case.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </main>
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
        <div
            className={`flex items-start gap-3 rounded-lg border p-3 ${
                done ? "bg-muted/50" : ""
            }`}
        >
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
