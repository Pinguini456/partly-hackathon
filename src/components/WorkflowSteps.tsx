import { Check } from "lucide-react";

type StepState = "done" | "active" | "next" | "upcoming";

const STEPS: { number: 1 | 2 | 3 | 4; text: string }[] = [
    { number: 1, text: "Upload" },
    { number: 2, text: "Analyse" },
    { number: 3, text: "Review" },
    { number: 4, text: "Repair Order" },
];

export function WorkflowSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
    return (
        <div className="mx-auto mb-8 flex max-w-[700px] items-center gap-3">
            {STEPS.map((step, i) => {
                const state: StepState =
                    step.number < current
                        ? "done"
                        : step.number === current
                          ? "active"
                          : step.number === current + 1
                            ? "next"
                            : "upcoming";
                return (
                    // display:contents so the step and its trailing connector both
                    // participate directly in the parent flex row, without adding
                    // an extra box that would throw off the connector widths.
                    <div key={step.number} className="contents">
                        <Step number={step.number} text={step.text} state={state} />
                        {i < STEPS.length - 1 && <div className="h-px flex-1 bg-border" />}
                    </div>
                );
            })}
        </div>
    );
}

function Step({
    number,
    text,
    state,
}: {
    number: number;
    text: string;
    state: StepState;
}) {
    return (
        <div className="flex shrink-0 items-center gap-2">
            <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
                    state === "active"
                        ? "bg-primary text-primary-foreground"
                        : state === "done"
                          ? "bg-accent text-primary"
                          : state === "next"
                            ? "border-2 border-primary/40 bg-card text-primary"
                            : "bg-secondary text-secondary-foreground"
                }`}
            >
                {state === "done" ? <Check className="h-4 w-4" /> : number}
            </div>

            <span
                className={`whitespace-nowrap text-sm ${
                    state === "upcoming" ? "text-muted-foreground" : "text-foreground"
                }`}
            >
                {text}
            </span>
        </div>
    );
}
