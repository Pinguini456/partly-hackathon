"use client";

// Ask-anything panel for one job. Deliberately a slide-over rather than an
// inline card: it's a thing you reach for mid-task and dismiss, not another
// box competing for space on a page that already has enough of them.

import { useEffect, useRef, useState } from "react";
import { MessageCircle, X, Send, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";

type Turn = { role: "user" | "model"; text: string };

// Openers that show what it can actually do, rather than leaving a blank box
// and hoping the mechanic guesses.
const SUGGESTIONS = [
    "What did the customer say was wrong?",
    "Which part is holding up this job?",
    "Draft a text telling them it'll be late",
];

export function CaseChat({ caseId, customerName }: { caseId: string; customerName?: string | null }) {
    const [open, setOpen] = useState(false);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [input, setInput] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [turns, busy]);

    async function send(text: string) {
        const question = text.trim();
        if (!question || busy) return;

        const next: Turn[] = [...turns, { role: "user", text: question }];
        setTurns(next);
        setInput("");
        setBusy(true);
        setError(null);

        try {
            const res = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ caseId, messages: next }),
            });
            const json = await res.json();
            if (!res.ok || json.error) {
                setError(json.error ?? "Couldn't reach the assistant.");
                return;
            }
            setTurns((prev) => [...prev, { role: "model", text: json.reply }]);
        } catch {
            setError("Couldn't reach the assistant.");
        } finally {
            setBusy(false);
        }
    }

    return (
        <>
            {!open && (
                <Button
                    onClick={() => setOpen(true)}
                    size="lg"
                    className="fixed bottom-6 right-6 z-40 rounded-full shadow-lg"
                >
                    <MessageCircle />
                    Ask about this job
                </Button>
            )}

            {open && (
                <>
                    <div
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
                    />
                    <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-2xl">
                        <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
                            <div>
                                <p className="flex items-center gap-2 font-semibold text-foreground">
                                    <Sparkles className="h-4 w-4 text-primary" />
                                    Ask about this job
                                </p>
                                <p className="mt-0.5 text-xs text-muted-foreground">
                                    Knows the whole case — transcripts, parts, order, notes.
                                </p>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                aria-label="Close"
                                onClick={() => setOpen(false)}
                            >
                                <X />
                            </Button>
                        </header>

                        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                            {turns.length === 0 && (
                                <div className="space-y-2">
                                    <p className="text-sm text-muted-foreground">
                                        Ask anything about {customerName?.split(" ")[0] ?? "this customer"}
                                        &apos;s job. For example:
                                    </p>
                                    {SUGGESTIONS.map((s) => (
                                        <button
                                            key={s}
                                            onClick={() => send(s)}
                                            className="block w-full rounded-lg border px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted"
                                        >
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            )}

                            {turns.map((t, i) => (
                                <div
                                    key={i}
                                    className={t.role === "user" ? "flex justify-end" : "flex justify-start"}
                                >
                                    <div
                                        className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm ${
                                            t.role === "user"
                                                ? "rounded-br-sm bg-primary text-primary-foreground"
                                                : "rounded-bl-sm border bg-muted text-foreground"
                                        }`}
                                    >
                                        {t.text}
                                    </div>
                                </div>
                            ))}

                            {busy && (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Reading the case…
                                </div>
                            )}
                            {error && <p className="text-sm text-destructive">{error}</p>}
                            <div ref={endRef} />
                        </div>

                        <div className="flex gap-2 border-t px-5 py-4">
                            <Input
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && send(input)}
                                placeholder="Ask about this job…"
                                disabled={busy}
                            />
                            <Button
                                onClick={() => send(input)}
                                disabled={busy || !input.trim()}
                                size="icon"
                                aria-label="Send"
                            >
                                <Send />
                            </Button>
                        </div>
                    </aside>
                </>
            )}
        </>
    );
}
