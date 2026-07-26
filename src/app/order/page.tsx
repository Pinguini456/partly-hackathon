"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Star, Store, Truck } from "lucide-react";
import { WorkflowSteps } from "@/src/components/WorkflowSteps";
import { buildOptions, SupplierOption } from "@/src/lib/supplierOptions";
import { Card, CardContent } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import { Badge } from "@/src/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Label } from "@/src/components/ui/label";
import { Separator } from "@/src/components/ui/separator";

type PartsResponse = {
    id: string[];
    name: string[];
    image: string[];
};

type Part = {
    id: string;
    name: string;
    image: string;
};

type OrderLine = {
    part: Part;
    option: SupplierOption;
};

export default function OrderPage() {
    const router = useRouter();

    const [parts, setParts] = useState<Part[] | null>(null);
    const [selections, setSelections] = useState<Record<string, string>>({});
    const [missing, setMissing] = useState(false);
    const [sendImagesToInsurer, setSendImagesToInsurer] = useState(false);

    useEffect(() => {
        const rawParts = sessionStorage.getItem("partly:parts");
        const rawSelections = sessionStorage.getItem("partly:selections");

        if (!rawParts || !rawSelections) {
            setMissing(true);
            return;
        }

        try {
            const data: PartsResponse = JSON.parse(rawParts);
            const zipped: Part[] = data.id.map((id, i) => ({
                id,
                name: data.name[i] ?? id,
                image: data.image[i] ?? "",
            }));
            const sel: Record<string, string> = JSON.parse(rawSelections);

            setParts(zipped);
            setSelections(sel);
        } catch {
            setMissing(true);
        }
    }, []);

    // Rebuild each part's supplier options from the same deterministic
    // generator used on the parts page, then keep only the parts that
    // actually have a chosen supplier.
    const orderLines = useMemo<OrderLine[]>(() => {
        if (!parts) return [];

        return parts
            .filter((part) => Boolean(selections[part.id]))
            .map((part) => {
                const options = buildOptions(part.id || part.name);
                const option = options.find(
                    (o) => o.supplier === selections[part.id]
                );
                return option ? { part, option } : null;
            })
            .filter((line): line is OrderLine => line !== null);
    }, [parts, selections]);

    const groupedByStore = useMemo(() => {
        const groups: Record<string, OrderLine[]> = {};
        orderLines.forEach((line) => {
            const store = line.option.supplier;
            if (!groups[store]) groups[store] = [];
            groups[store].push(line);
        });
        return groups;
    }, [orderLines]);

    const orderTotal = orderLines.reduce(
        (sum, line) => sum + line.option.price,
        0
    );

    // Each store ships its items together, so a store's shipping time is the
    // slowest item in that store, and the whole order's shipping time is
    // whichever store takes the longest.
    const storeShippingDays = Object.fromEntries(
        Object.entries(groupedByStore).map(([store, lines]) => [
            store,
            Math.max(...lines.map((l) => l.option.shippingDays)),
        ])
    );

    const orderShippingDays = Object.values(storeShippingDays).length
        ? Math.max(...Object.values(storeShippingDays))
        : 0;

    // Each part's ETA is estimated from its supplier's shipping time, counted
    // from the moment the order is placed. The timeline page uses this to
    // compute pickup date, so both start out equal (no slip yet).
    function placeOrder() {
        const dayMs = 86400000;
        const orderedParts = orderLines.map(({ part, option }) => {
            const etaISO = new Date(Date.now() + option.shippingDays * dayMs)
                .toISOString()
                .slice(0, 10);
            return { id: part.id, name: part.name, eta: etaISO, originalEta: etaISO };
        });
        sessionStorage.setItem("partly:orderedParts", JSON.stringify(orderedParts));
        router.push("/repair-timeline");
    }

    if (missing) {
        return (
            <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
                <div>
                    <p className="text-muted-foreground">
                        No order data found. Go back and select parts first.
                    </p>
                    <Button size="lg" onClick={() => router.push("/parts")} className="mt-6">
                        Back to parts
                    </Button>
                </div>
            </main>
        );
    }

    if (!parts) return null;

    return (
        <main className="min-h-screen bg-background text-foreground">
            <header className="border-b bg-card">
                <div className="mx-auto max-w-6xl px-8 py-6">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => router.push("/parts")}
                        className="mb-3 -ml-2 text-muted-foreground"
                    >
                        <ArrowLeft />
                        Back to parts
                    </Button>
                    <h1 className="text-3xl font-semibold text-foreground">Order</h1>
                    <p className="mt-2 text-muted-foreground">
                        Review your order, organised by store.
                    </p>
                </div>
            </header>

            <div className="mx-auto max-w-6xl px-8 pt-10">
                <WorkflowSteps current={4} />
            </div>

            <div className="mx-auto max-w-6xl px-8 pb-10">
                {orderLines.length === 0 ? (
                    <Card>
                        <CardContent className="py-8 text-center">
                            <p className="text-muted-foreground">
                                No parts selected yet. Go back and choose a supplier for
                                at least one part.
                            </p>
                            <Button size="lg" onClick={() => router.push("/parts")} className="mt-6">
                                Choose parts
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid grid-cols-1 gap-8 md:grid-cols-[1fr_320px]">
                        {/* Left: order lines grouped by store */}
                        <div className="space-y-6">
                            {Object.entries(groupedByStore).map(([store, lines]) => {
                                const storeTotal = lines.reduce(
                                    (sum, l) => sum + l.option.price,
                                    0
                                );
                                return (
                                    <Card key={store}>
                                        <CardContent>
                                        <div className="flex items-center justify-between border-b pb-4">
                                            <div className="flex items-center gap-2">
                                                <Store className="h-5 w-5 text-primary" />
                                                <h2 className="text-lg font-semibold text-foreground">
                                                    {store}
                                                </h2>
                                            </div>
                                            <span className="text-sm text-muted-foreground">
                          {lines.length} item{lines.length === 1 ? "" : "s"}
                        </span>
                                        </div>

                                        <div className="mt-4 space-y-4">
                                            {lines.map(({ part, option }) => (
                                                <div
                                                    key={part.id}
                                                    className="flex items-center justify-between gap-4"
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border">
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
                                                        <div>
                                                            <p className="font-medium text-foreground">
                                                                {part.name}
                                                            </p>
                                                            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                                    <Badge variant={option.type === "OEM" ? "secondary" : "outline"}>
                                      {option.type}
                                    </Badge>
                                                                <span className="flex items-center gap-1">
                                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                                                    {option.rating.toFixed(1)}
                                    </span>
                                                                <span className="flex items-center gap-1">
                                      <Truck className="h-3.5 w-3.5" />
                                                                    {option.shippingDays} day
                                                                    {option.shippingDays === 1 ? "" : "s"}
                                    </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <p className="font-semibold text-foreground">
                                                        ${option.price}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="mt-4 flex items-center justify-between border-t pt-4 text-sm">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Truck className="h-4 w-4" />
                              Shipping time
                            </span>
                                            <span className="font-semibold text-foreground">
                              {storeShippingDays[store]} day
                                                {storeShippingDays[store] === 1 ? "" : "s"}
                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center justify-between text-sm">
                                            <span className="text-muted-foreground">Store subtotal</span>
                                            <span className="font-semibold text-foreground">
                              ${storeTotal}
                            </span>
                                        </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>

                        {/* Right: order summary */}
                        <Card className="h-fit">
                            <CardContent>
                            <h2 className="text-lg font-semibold text-foreground">
                                Order summary
                            </h2>

                            <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                                <div className="flex items-center justify-between">
                                    <span>Parts</span>
                                    <span>{orderLines.length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Stores</span>
                                    <span>{Object.keys(groupedByStore).length}</span>
                                </div>
                                <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Truck className="h-3.5 w-3.5" />
                        Shipping time
                      </span>
                                    <span>
                        {orderShippingDays} day
                                        {orderShippingDays === 1 ? "" : "s"}
                      </span>
                                </div>
                            </div>

                            <Separator className="mt-4" />

                            <div className="mt-4 flex items-center justify-between">
                                <span className="font-medium text-foreground">Total</span>
                                <span className="text-xl font-bold text-foreground">
                      ${orderTotal}
                    </span>
                            </div>

                            <div className="mt-4 flex items-center gap-2">
                                <Checkbox
                                    id="send-images"
                                    checked={sendImagesToInsurer}
                                    onCheckedChange={(checked) =>
                                        setSendImagesToInsurer(checked === true)
                                    }
                                />
                                <Label htmlFor="send-images" className="text-sm text-muted-foreground">
                                    Send images to insurer
                                </Label>
                            </div>

                            <Button size="lg" onClick={placeOrder} className="mt-6 w-full">
                                Place Order
                            </Button>

                            <Button
                                size="lg"
                                variant="outline"
                                onClick={() => router.push("/parts")}
                                className="mt-3 w-full"
                            >
                                Change Parts
                            </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>
        </main>
    );
}