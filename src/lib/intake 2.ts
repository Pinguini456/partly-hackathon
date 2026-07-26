// Everything captured at drop-off, before a spanner is picked up: who's
// paying, what the customer said was wrong, and the work that implies.
//
// Storage note: this rides in the existing `summary` text column as a JSON
// envelope rather than in columns of its own. The anon key can't run DDL,
// and "the intake summary for this case" is honestly what the column means,
// so this isn't a squat so much as a fill. If someone gets dashboard access
// later, splitting these into real jsonb columns is a mechanical change —
// read/write already funnels through the two helpers at the bottom.

export type Insurance = {
    insurer?: string;
    policyNumber?: string;
    claimNumber?: string;
    excess?: string;
};

export type CustomerProblem = {
    summary: string;
    quote: string;
};

export type TodoStatus = "suggested" | "accepted" | "done";

export type Todo = {
    id: string;
    task: string;
    status: TodoStatus;
    /** Where it came from — an inference, or a person. */
    source: "ai" | "mechanic";
    /** AI-sourced only: the inference and the phrase behind it. */
    reason?: string;
    fromQuote?: string;
    addedAt: string;
};

/** A message actually sent to the customer, kept so the thread survives a
 *  reload and anyone opening the case sees what they've already been told. */
export type CustomerMessage = {
    text: string;
    at: string;
    /** Which stage triggered it, or "manual" for a one-off. */
    stage: string;
};

export type Intake = {
    insurance?: Insurance | null;
    /** Full transcript of the drop-off conversation. */
    interviewTranscript?: string | null;
    problems?: CustomerProblem[];
    todos?: Todo[];
    messages?: CustomerMessage[];
};

export const EMPTY_INTAKE: Intake = {
    insurance: null,
    interviewTranscript: null,
    problems: [],
    todos: [],
    messages: [],
};

/** Reads the envelope back out of `summary`, tolerating legacy plain text. */
export function parseIntake(summary: string | null | undefined): Intake {
    if (!summary) return { ...EMPTY_INTAKE };
    try {
        const parsed = JSON.parse(summary);
        // A pre-envelope case may hold a plain-text summary — keep it rather
        // than throwing it away, and treat the rest as empty.
        if (typeof parsed !== "object" || parsed === null) return { ...EMPTY_INTAKE };
        return {
            insurance: parsed.insurance ?? null,
            interviewTranscript: parsed.interviewTranscript ?? null,
            problems: Array.isArray(parsed.problems) ? parsed.problems : [],
            todos: Array.isArray(parsed.todos) ? parsed.todos : [],
            messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        };
    } catch {
        return { ...EMPTY_INTAKE };
    }
}

export function serialiseIntake(intake: Intake): string {
    return JSON.stringify(intake);
}

export function hasInsurance(insurance: Insurance | null | undefined): boolean {
    if (!insurance) return false;
    return Boolean(
        insurance.insurer ||
            insurance.policyNumber ||
            insurance.claimNumber ||
            insurance.excess,
    );
}

/** Suggested to-dos are the ones still awaiting a mechanic's call. */
export function splitTodos(todos: Todo[]) {
    return {
        suggested: todos.filter((t) => t.status === "suggested"),
        active: todos.filter((t) => t.status === "accepted"),
        done: todos.filter((t) => t.status === "done"),
    };
}

export function makeTodoId() {
    return `todo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
