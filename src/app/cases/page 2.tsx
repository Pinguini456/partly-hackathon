"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Car, User, Plus } from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import { buttonVariants } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { vehicleLabel } from "@/src/lib/vehicles";
import { cn } from "@/src/lib/utils";

type CaseListItem = {
    id: string;
    status: string;
    vehicle_slug: string | null;
    customer_name: string | null;
    created_at: string;
    thumbnail: string | null;
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

export default function CasesPage() {
    const [cases, setCases] = useState<CaseListItem[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch("/api/cases")
            .then((res) => res.json())
            .then((data) => {
                if (data.error) {
                    setError(data.error);
                    return;
                }
                setCases(data.cases ?? []);
            })
            .catch(() => setError("Failed to load cases"));
    }, []);

    return (
        <main className="min-h-screen bg-background text-foreground">
            <div className="mx-auto max-w-6xl px-8 py-10">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-semibold text-foreground">Cases</h1>
                        <p className="mt-2 text-muted-foreground">
                            Every job in the shop. Open one to get the whole file.
                        </p>
                    </div>
                    <Link href="/" className={cn(buttonVariants({ size: "lg" }))}>
                        <Plus />
                        New case
                    </Link>
                </div>

                {error && <p className="mt-6 text-sm text-destructive">{error}</p>}
                {!cases && !error && <p className="mt-6 text-muted-foreground">Loading…</p>}

                {cases && cases.length === 0 && (
                    <Card className="mt-8">
                        <CardContent className="py-12 text-center">
                            <Car className="mx-auto h-10 w-10 text-muted-foreground/40" />
                            <p className="mt-3 text-muted-foreground">
                                No cases yet. Start one with the car in front of you.
                            </p>
                            <Link href="/" className={cn(buttonVariants(), "mt-4")}>
                                New case
                            </Link>
                        </CardContent>
                    </Card>
                )}

                <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {cases?.map((c) => (
                        <Link key={c.id} href={`/cases/${c.id}`} className="group">
                            <Card className="overflow-hidden py-0 transition group-hover:border-primary group-hover:shadow-md">
                                <div className="flex h-40 items-center justify-center overflow-hidden bg-muted">
                                    {c.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={c.thumbnail}
                                            alt={vehicleLabel(c.vehicle_slug)}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <Car className="h-10 w-10 text-muted-foreground/40" />
                                    )}
                                </div>
                                <CardContent className="py-4">
                                    <p className="font-semibold text-foreground">
                                        {vehicleLabel(c.vehicle_slug)}
                                    </p>
                                    <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                                        <User className="h-3.5 w-3.5" />
                                        {c.customer_name || "No customer name"}
                                    </p>
                                    <div className="mt-3 flex items-center justify-between">
                                        <Badge variant="secondary">
                                            {STATUS_LABELS[c.status] ?? c.status.replace(/_/g, " ")}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {new Date(c.created_at).toLocaleDateString("en-NZ")}
                                        </span>
                                    </div>
                                </CardContent>
                            </Card>
                        </Link>
                    ))}
                </div>
            </div>
        </main>
    );
}
