// One definition of how far along a job is, shared by the progress bar, the
// status badge and the customer message thread — so the bar can never
// disagree with what the customer was last told.

export type LifecycleKey =
    | "uploaded"
    | "parts_identified"
    | "parts_ordered"
    | "parts_arrived"
    | "in_bay"
    | "ready";

export const LIFECYCLE: { key: LifecycleKey; label: string; short: string }[] = [
    { key: "uploaded", label: "Intake", short: "Intake" },
    { key: "parts_identified", label: "Damage assessed", short: "Assessed" },
    { key: "parts_ordered", label: "Parts ordered", short: "Ordered" },
    { key: "parts_arrived", label: "Parts arrived", short: "Arrived" },
    { key: "in_bay", label: "In the bay", short: "In bay" },
    { key: "ready", label: "Ready for pickup", short: "Ready" },
];

// Statuses written by earlier steps that mean the same thing as a lifecycle
// stage — mapped rather than renamed, so existing rows keep working.
const ALIASES: Record<string, LifecycleKey> = {
    analysing: "uploaded",
    basket_chosen: "parts_ordered",
    damage_assessed: "parts_identified",
};

export function normaliseStatus(status: string | null | undefined): LifecycleKey {
    if (!status) return "uploaded";
    if (status in ALIASES) return ALIASES[status];
    return LIFECYCLE.some((s) => s.key === status) ? (status as LifecycleKey) : "uploaded";
}

export function stageIndex(status: string | null | undefined): number {
    const key = normaliseStatus(status);
    return Math.max(0, LIFECYCLE.findIndex((s) => s.key === key));
}

export function progressOf(status: string | null | undefined) {
    const index = stageIndex(status);
    const stage = LIFECYCLE[index];
    return {
        index,
        stage,
        total: LIFECYCLE.length,
        // The last stage is 100%; intake alone shouldn't read as zero
        // progress, since the job genuinely has been booked in.
        percent: Math.round(((index + 1) / LIFECYCLE.length) * 100),
        isComplete: index === LIFECYCLE.length - 1,
    };
}

/** What the customer gets told when a job reaches this stage. */
export function customerMessageFor(key: LifecycleKey, firstName: string): string | null {
    switch (key) {
        case "parts_identified":
            return `Hi ${firstName} — we've assessed the damage on your vehicle and we're putting your job card together now.`;
        case "parts_ordered":
            return "Good news — the parts for your repair have been ordered and are on their way.";
        case "parts_arrived":
            return "All your parts have arrived at the shop. Your vehicle is next in for the bay.";
        case "in_bay":
            return "Your vehicle is in the workshop now and repairs have started.";
        case "ready":
            return "🎉 Your vehicle is ready for pickup!";
        // Nothing to say at intake — they just handed the keys over.
        case "uploaded":
        default:
            return null;
    }
}

export function firstNameOf(customerName: string | null | undefined): string {
    return (customerName ?? "").trim().split(/\s+/)[0] || "there";
}
