"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock } from "lucide-react";
import { Card, CardContent } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertDescription } from "@/src/components/ui/alert";

type Part = { id: string; name: string; eta: string; originalEta: string };
type Option = { label: string; cost: number; readyDateISO: string; parts: Part[] };
type ChoicePayload = { recommended: Option; alternative: Option };

const dayMs = 86400000;

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function daysBetween(aISO: string, bISO: string) {
  return Math.round((+new Date(aISO) - +new Date(bISO)) / dayMs);
}

// The default reply time if the customer doesn't respond — the job keeps
// moving on the recommended option rather than stalling on a phone call.
const DEFAULT_DEADLINE = "4:00pm today";

export default function ChooseBasketPage() {
  const router = useRouter();
  const [choice, setChoice] = useState<ChoicePayload | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("partly:customerChoice");
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setChoice(JSON.parse(raw));
    } catch {
      setMissing(true);
    }
  }, []);

  function choose(option: Option) {
    sessionStorage.setItem(
      "partly:chosenBasket",
      JSON.stringify({
        parts: option.parts,
        label: `Customer chose: ${option.label} — $${option.cost}, ready ${fmt(option.readyDateISO)}`,
      }),
    );
    sessionStorage.removeItem("partly:customerChoice");
    router.push("/track");
  }

  if (missing) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-8 text-center">
        <p className="text-muted-foreground">
          No pending choice found. Go to the procurement page and click &quot;Send to customer to
          choose&quot;.
        </p>
      </main>
    );
  }

  if (!choice) return null;

  const { recommended, alternative } = choice;
  const dateDiff = daysBetween(alternative.readyDateISO, recommended.readyDateISO);
  const costDiff = alternative.cost - recommended.cost;

  const altDescription =
    dateDiff < 0
      ? `Pay $${costDiff} more, get it back ${Math.abs(dateDiff)} day${Math.abs(dateDiff) === 1 ? "" : "s"} sooner.`
      : dateDiff > 0
        ? `Save $${Math.abs(costDiff)}, but costs you ${dateDiff} extra day${dateDiff === 1 ? "" : "s"} without the car.`
        : `Same date, ${costDiff < 0 ? "saves" : "costs"} $${Math.abs(costDiff)}.`;

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold text-foreground">
          Your repair — how would you like it handled?
        </h1>
        <p className="mt-2 text-muted-foreground">Two options for finishing your repair.</p>

        <div className="mt-8 space-y-4">
          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose(recommended)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(recommended);
              }
            }}
            className="cursor-pointer ring-2 ring-primary transition-colors hover:bg-accent"
          >
            <CardContent>
              <Badge>This is what we&apos;d pick</Badge>
              <p className="mt-3 text-3xl font-bold text-foreground">${recommended.cost}</p>
              <p className="text-muted-foreground">Ready {fmt(recommended.readyDateISO)}</p>
            </CardContent>
          </Card>

          <Card
            role="button"
            tabIndex={0}
            onClick={() => choose(alternative)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                choose(alternative);
              }
            }}
            className="cursor-pointer transition-colors hover:bg-accent"
          >
            <CardContent>
              <p className="text-3xl font-bold text-foreground">${alternative.cost}</p>
              <p className="text-muted-foreground">Ready {fmt(alternative.readyDateISO)}</p>
              <p className="mt-2 text-sm text-muted-foreground">{altDescription}</p>
            </CardContent>
          </Card>
        </div>

        <Alert className="mt-8">
          <Clock />
          <AlertDescription>
            If we don&apos;t hear back by <strong>{DEFAULT_DEADLINE}</strong>, we&apos;ll go with
            our pick above so the job keeps moving.
          </AlertDescription>
        </Alert>

        <Button
          variant="link"
          size="sm"
          onClick={() => choose(recommended)}
          className="mt-3 px-0 text-muted-foreground"
        >
          Simulate: no reply by {DEFAULT_DEADLINE}
        </Button>
      </div>
    </main>
  );
}
