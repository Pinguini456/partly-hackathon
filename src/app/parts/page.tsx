"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    ArrowLeft,
    ArrowUpDown,
    CheckCircle2,
    ImageOff,
    Package,
    Sparkles,
    Star,
    Truck,
    ShieldCheck,
    AlertTriangle,
} from "lucide-react";
import { WorkflowSteps } from "@/src/components/WorkflowSteps";
import {
    buildOptions,
    optionKey,
    scoreOptions,
    SupplierOption,
} from "@/src/lib/supplierOptions";
import { heroOptionsFor, heroDetailFor, heroUnconfirmedParts } from "@/src/lib/heroCase";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";

type PartsResponse = {
    id: string[];
    name: string[];
    image: string[];
    freeform?: boolean;
};

type Part = {
    id: string;
    name: string;
    image: string;
};

type SortKey = "best" | "price" | "rating" | "shipping";
type SortDirection = "asc" | "desc";

const SORTS: { key: SortKey; label: string }[] = [
    { key: "best", label: "Best overall" },
    { key: "price", label: "Price" },
    { key: "rating", label: "Reliability" },
    { key: "shipping", label: "Shipping time" },
];

function PartsPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const caseId = searchParams.get("case");

    const [parts, setParts] = useState<Part[] | null>(null);
    const [vehicleSlug, setVehicleSlug] = useState<string | null>(null);
    const [missing, setMissing] = useState(false);

    const [activePartId, setActivePartId] = useState<string | null>(null);
    const [selections, setSelections] = useState<Record<string, string>>({});

    // Defaults to the recommendation rather than a raw column sort — the
    // whole point is that the repairer shouldn't have to do the trade-off
    // in their head before they see an answer.
    const [sortKey, setSortKey] = useState<SortKey>("best");
    const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

    const applyParts = useCallback((data: PartsResponse, slug: string | null) => {
        const zipped: Part[] = (data.id ?? []).map((id, i) => ({
            id,
            name: data.name?.[i] ?? id,
            image: data.image?.[i] ?? "",
        }));
        if (!zipped.length) {
            setMissing(true);
            return;
        }
        setParts(zipped);
        setVehicleSlug(slug);
        setActivePartId(zipped[0]?.id ?? null);
    }, []);

    // A case id is the real source of truth; sessionStorage is the fallback
    // for anyone who landed here straight off an analysis.
    useEffect(() => {
        let cancelled = false;

        async function load() {
            if (caseId) {
                try {
                    const res = await fetch(`/api/cases/${caseId}`);
                    const json = await res.json();
                    if (cancelled) return;
                    if (res.ok && json.case?.parts?.id?.length) {
                        applyParts(json.case.parts, json.case.vehicle_slug ?? null);
                        if (json.case.basket?.lines) {
                            const prior: Record<string, string> = {};
                            json.case.basket.lines.forEach(
                                (l: { id: string; supplier: string }) => {
                                    prior[l.id] = l.supplier;
                                },
                            );
                            setSelections(prior);
                        }
                        return;
                    }
                } catch {
                    // fall through to sessionStorage
                }
            }

            const raw = sessionStorage.getItem("partly:parts");
            if (!raw) {
                if (!cancelled) setMissing(true);
                return;
            }
            try {
                const data: PartsResponse & { vehicle?: string } = JSON.parse(raw);
                if (!cancelled) applyParts(data, data.vehicle ?? null);
            } catch {
                if (!cancelled) setMissing(true);
            }

            const rawSelections = sessionStorage.getItem("partly:selections");
            if (rawSelections && !cancelled) {
                try {
                    setSelections(JSON.parse(rawSelections));
                } catch {
                    // Ignore malformed/stale selection data.
                }
            }
        }

        load();
        return () => {
            cancelled = true;
        };
    }, [caseId, applyParts]);

    // Keep chosen suppliers in sessionStorage so they survive navigating to
    // the order page (and back) without needing to re-select anything.
    useEffect(() => {
        sessionStorage.setItem("partly:selections", JSON.stringify(selections));
    }, [selections]);

    // Hero-case parts carry modelled delivery history; everything else falls
    // back to the deterministic mock pool. Same shape either way, so the UI
    // below doesn't branch.
    const optionsByPart = useMemo(() => {
        const map: Record<string, SupplierOption[]> = {};
        parts?.forEach((part) => {
            map[part.id] =
                heroOptionsFor(vehicleSlug, part.name) ?? buildOptions(part.id || part.name);
        });
        return map;
    }, [parts, vehicleSlug]);

    const activePart = parts?.find((p) => p.id === activePartId) ?? null;
    const activeOptions = useMemo(
        () => (activePart ? (optionsByPart[activePart.id] ?? []) : []),
        [activePart, optionsByPart],
    );

    const scored = useMemo(() => scoreOptions(activeOptions), [activeOptions]);
    const recommended = scored[0] ?? null;

    const sortedOptions = useMemo(() => {
        if (sortKey === "best") return scored.map((s) => s.option);
        const dir = sortDirection === "asc" ? 1 : -1;
        return [...activeOptions].sort((a, b) => {
            if (sortKey === "price") return (a.price - b.price) * dir;
            if (sortKey === "rating") return (b.rating - a.rating) * dir;
            return (a.shippingDays - b.shippingDays) * dir;
        });
    }, [activeOptions, scored, sortKey, sortDirection]);

    function toggleSort(key: SortKey) {
        if (key === "best") {
            setSortKey("best");
            return;
        }
        if (sortKey === key) {
            setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
        } else {
            setSortKey(key);
            setSortDirection("asc");
        }
    }

    function selectOption(partId: string, supplier: string) {
        setSelections((prev) => ({ ...prev, [partId]: supplier }));
    }

    /** One click, whole basket — the recommendation applied to every part. */
    function autoPickAll() {
        if (!parts) return;
        const picks: Record<string, string> = {};
        parts.forEach((part) => {
            const best = scoreOptions(optionsByPart[part.id] ?? [])[0];
            if (best) picks[part.id] = best.option.supplier;
        });
        setSelections(picks);
    }

    if (missing) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
                <div>
                    <p className="text-muted-foreground">
                        No parts data found. Go back and analyse a case first.
                    </p>
                    <Button size="lg" onClick={() => router.push("/")} className="mt-6">
                        Back to upload
                    </Button>
                </div>
            </main>
        );
    }

    if (!parts) return null;

    const selectedCount = Object.keys(selections).length;
    const orderTotal = parts.reduce((sum, part) => {
        const chosen = selections[part.id];
        if (!chosen) return sum;
        const option = optionsByPart[part.id]?.find((o) => o.supplier === chosen);
        return sum + (option?.price ?? 0);
    }, 0);

    const backHref = caseId ? `/cases/${caseId}` : "/";
    const orderHref = caseId ? `/order?case=${caseId}` : "/order";
    const activeDetail = activePart ? heroDetailFor(vehicleSlug, activePart.name) : null;
    const unconfirmed = heroUnconfirmedParts(vehicleSlug);

    return (
        <main className="min-h-screen bg-background text-foreground">
            <header className="border-b bg-card">
                <div className="mx-auto max-w-6xl px-8 py-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push(backHref)}
                        className="mb-3 -ml-2 text-muted-foreground"
                    >
                        <ArrowLeft />
                        {caseId ? "Back to case" : "Back to upload"}
                    </Button>
                    <h1 className="text-3xl font-semibold text-foreground">Select Parts</h1>
                    <p className="mt-2 text-muted-foreground">
                        Choose a supplier for each identified part.
                    </p>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-8 pt-10">
                <WorkflowSteps current={3} />
            </div>

            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-8 pb-10 md:grid-cols-[280px_1fr]">
                {/* Left: parts list */}
                <Card className="h-fit" size="sm">
                    <CardContent>
                        <h2 className="px-2 pb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                            Identified parts
                        </h2>
                        <div className="space-y-1">
                            {parts.map((part) => {
                                const isActive = part.id === activePartId;
                                const isChosen = Boolean(selections[part.id]);
                                return (
                                    <button
                                        key={part.id}
                                        onClick={() => setActivePartId(part.id)}
                                        className={`flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left transition ${
                                            isActive
                                                ? "bg-accent text-accent-foreground"
                                                : "text-foreground hover:bg-muted"
                                        }`}
                                    >
                                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md">
                                            {part.image ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={part.image}
                                                    alt={part.name}
                                                    className="h-full w-full object-contain"
                                                />
                                            ) : (
                                                <Package className="h-5 w-5 text-muted-foreground" />
                                            )}
                                        </div>
                                        <span className="flex-1 truncate text-sm font-medium">
                                            {part.name}
                                        </span>
                                        {isChosen && (
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        <Button variant="outline" onClick={autoPickAll} className="mt-4 w-full">
                            <Sparkles />
                            Pick best for every part
                        </Button>

                        <div className="mt-4 rounded-lg border border-dashed p-3">
                            <p className="text-xs text-muted-foreground">
                                {selectedCount} of {parts.length} parts selected
                            </p>
                            <p className="mt-1 text-lg font-semibold text-foreground">
                                ${orderTotal}
                            </p>
                        </div>

                        <Button
                            size="lg"
                            onClick={() => router.push(orderHref)}
                            disabled={selectedCount === 0}
                            className="mt-4 w-full"
                        >
                            Proceed to Order
                        </Button>

                        {/* Low-confidence predictions the catalogue won't sell.
                            Shown as a decision, not silently dropped. */}
                        {unconfirmed.length > 0 && (
                            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                                    <AlertTriangle className="h-3.5 w-3.5" />
                                    Flagged, not ordered
                                </p>
                                {unconfirmed.map((u) => (
                                    <p key={u.name} className="mt-1 text-xs text-amber-700">
                                        <span className="font-medium">{u.name}</span> — {u.reason}
                                    </p>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Right: active part + options */}
                <section>
                    {activePart && (
                        <>
                            <Card>
                                <CardContent className="flex flex-col items-center">
                                    <div className="flex h-80 w-full max-w-xl items-center justify-center overflow-hidden rounded-lg sm:h-[28rem]">
                                        {activePart.image ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                                src={activePart.image}
                                                alt={activePart.name}
                                                className="h-full w-full object-contain"
                                            />
                                        ) : (
                                            <div className="text-center">
                                                <ImageOff className="mx-auto h-12 w-12 text-muted-foreground/40" />
                                                <p className="mt-2 text-sm text-muted-foreground">
                                                    No diagram — this vehicle has no OEM catalogue.
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="mt-5 text-center">
                                        <p className="text-sm text-muted-foreground">Part needed</p>
                                        <h2 className="text-2xl font-semibold text-foreground">
                                            {activePart.name}
                                        </h2>

                                        {/* What the damage model actually concluded —
                                            available where we have real prediction data. */}
                                        {activeDetail && (
                                            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                                <Badge variant="secondary">
                                                    {activeDetail.predicted.action}
                                                </Badge>
                                                <Badge variant="outline">
                                                    {activeDetail.predicted.severity} damage
                                                </Badge>
                                                <Badge variant="outline">
                                                    {activeDetail.predicted.confidence} confidence
                                                </Badge>
                                                <span className="font-mono text-xs text-muted-foreground">
                                                    {activeDetail.mpn.split(":")[1] ??
                                                        activeDetail.mpn}
                                                </span>
                                            </div>
                                        )}

                                        {selections[activePart.id] && (
                                            <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-green-50 px-3 py-1 text-sm font-medium text-green-700">
                                                <CheckCircle2 className="h-4 w-4" />
                                                Ordering from {selections[activePart.id]}
                                            </p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Sort controls */}
                            <div className="mt-6 flex flex-wrap items-center gap-2">
                                <span className="flex items-center gap-1 text-sm text-muted-foreground">
                                    <ArrowUpDown className="h-4 w-4" />
                                    Sort by
                                </span>
                                {SORTS.map(({ key, label }) => (
                                    <Button
                                        key={key}
                                        size="sm"
                                        variant={sortKey === key ? "default" : "outline"}
                                        onClick={() => toggleSort(key)}
                                        className="rounded-full"
                                    >
                                        {key === "best" && <Sparkles />}
                                        {label}
                                        {sortKey === key &&
                                            key !== "best" &&
                                            (sortDirection === "asc" ? " ↑" : " ↓")}
                                    </Button>
                                ))}
                            </div>

                            {/* The recommendation, spelled out. Sorting one column
                                at a time never says why — this does. */}
                            {sortKey === "best" && recommended && (
                                <div className="mt-4 rounded-xl border border-primary/40 bg-accent/50 p-4">
                                    <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                        <Sparkles className="h-4 w-4 text-primary" />
                                        Best overall: {recommended.option.supplier}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                        {recommended.reason}
                                    </p>
                                </div>
                            )}

                            {/* Options */}
                            <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                {sortedOptions.map((option) => {
                                    const isSelected =
                                        selections[activePart.id] === option.supplier;
                                    const isRecommended =
                                        recommended?.option.supplier === option.supplier;
                                    return (
                                        <Card
                                            key={optionKey(option)}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() =>
                                                selectOption(activePart.id, option.supplier)
                                            }
                                            onKeyDown={(e) => {
                                                if (e.key === "Enter" || e.key === " ") {
                                                    e.preventDefault();
                                                    selectOption(activePart.id, option.supplier);
                                                }
                                            }}
                                            className={`cursor-pointer text-left transition ${
                                                isSelected
                                                    ? "bg-accent ring-2 ring-primary"
                                                    : "hover:bg-muted"
                                            }`}
                                        >
                                            <CardContent>
                                                <div className="flex items-start justify-between gap-2">
                                                    <div>
                                                        <p className="font-semibold text-foreground">
                                                            {option.supplier}
                                                        </p>
                                                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                                            <Badge
                                                                variant={
                                                                    option.type === "OEM"
                                                                        ? "secondary"
                                                                        : "outline"
                                                                }
                                                            >
                                                                {option.type}
                                                            </Badge>
                                                            {isRecommended && (
                                                                <Badge className="bg-primary text-primary-foreground">
                                                                    Recommended
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {isSelected && (
                                                        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                                                    )}
                                                </div>

                                                <p className="mt-4 text-2xl font-bold text-foreground">
                                                    ${option.price}
                                                </p>

                                                <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                                                        {option.rating.toFixed(1)}
                                                    </span>
                                                    <span className="flex items-center gap-1">
                                                        <Truck className="h-4 w-4" />
                                                        {option.shippingDays} day
                                                        {option.shippingDays === 1 ? "" : "s"}
                                                    </span>
                                                </div>

                                                {/* Reliability, where we have it. A supplier
                                                    that promises early and misses isn't early. */}
                                                {option.onTimeRate != null && (
                                                    <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                                                        <p className="flex items-center gap-1">
                                                            <ShieldCheck className="h-3.5 w-3.5" />
                                                            {Math.round(option.onTimeRate * 100)}% on
                                                            time over {option.orderCount} orders
                                                        </p>
                                                        {option.promisedDays != null &&
                                                            option.promisedDays !==
                                                                option.shippingDays && (
                                                                <p className="mt-1">
                                                                    Quotes {option.promisedDays}d — we
                                                                    schedule {option.shippingDays}d on
                                                                    their record
                                                                </p>
                                                            )}
                                                        {option.returnRate != null && (
                                                            <p className="mt-1 text-amber-700">
                                                                {Math.round(option.returnRate * 100)}%
                                                                returned for fitment
                                                            </p>
                                                        )}
                                                    </div>
                                                )}
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </section>
            </div>
        </main>
    );
}

// useSearchParams needs a Suspense boundary or the build fails the route.
export default function PartsPage() {
    return (
        <Suspense fallback={null}>
            <PartsPageInner />
        </Suspense>
    );
}
