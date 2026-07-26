// Lightweight localStorage-backed "orders" persistence layer.
//
// There's no backend/database for this project, so every order placed on
// /order is written here instead. It's the single source of truth read by
// the dashboard (list + delete) and by /repair-timeline (load + live-update
// a specific order's progress).

export type ManualStage =
    | "damage_assessed"
    | "parts_ordered"
    | "parts_arrived"
    | "in_bay"
    | "ready";

export type StoredPart = {
    id: string;
    name: string;
    eta: string;
    originalEta: string;
};

export type StoredNotification = {
    text: string;
    /** ISO timestamp. */
    at: string;
};

export type StoredOrder = {
    id: string;
    /** ISO timestamp of when the order was placed. */
    createdAt: string;
    /** Human-friendly label for the job, e.g. "Front-end repair". */
    vehicleLabel: string;
    /** Optional plate — blank when not known. */
    plate: string;
    parts: StoredPart[];
    total: number;
    storeCount: number;
    /** ISO date-only string — the pickup date promised at order time. */
    originalReadyDate: string;
    doneAt: Partial<Record<ManualStage, string>>;
    notifications: StoredNotification[];
    notifyOnStage: boolean;
};

const STORAGE_KEY = "partly:orders";

function isBrowser() {
    return typeof window !== "undefined";
}

function readAll(): StoredOrder[] {
    if (!isBrowser()) return [];
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        // Corrupt or unavailable storage — treat as empty rather than throwing.
        return [];
    }
}

function writeAll(orders: StoredOrder[]) {
    if (!isBrowser()) return;
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
    } catch {
        // Storage full/blocked (private browsing, quota, etc). This is a demo
        // persistence layer, so fail silently rather than crash the page.
    }
}

/** Newest first, so the dashboard doesn't need to sort itself. */
export function listOrders(): StoredOrder[] {
    return readAll().sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export function getOrder(id: string): StoredOrder | undefined {
    return readAll().find((o) => o.id === id);
}

/** Insert or fully replace an order. */
export function saveOrder(order: StoredOrder) {
    const all = readAll();
    const idx = all.findIndex((o) => o.id === order.id);
    if (idx === -1) all.push(order);
    else all[idx] = order;
    writeAll(all);
}

/** Shallow-merge a patch into an existing order. No-ops if the id is gone. */
export function updateOrder(id: string, patch: Partial<StoredOrder>) {
    const all = readAll();
    const idx = all.findIndex((o) => o.id === id);
    if (idx === -1) return;
    all[idx] = { ...all[idx], ...patch };
    writeAll(all);
}

export function deleteOrder(id: string) {
    writeAll(readAll().filter((o) => o.id !== id));
}

export function newOrderId(): string {
    if (isBrowser() && window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
