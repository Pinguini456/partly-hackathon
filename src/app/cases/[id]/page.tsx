"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileText, Plus, User, Phone } from "lucide-react";

type CaseFile = { id: string; filename: string; url: string; created_at: string };
type Note = { text: string; at: string };
type CaseParts = { id: string[]; name: string[]; image: string[]; freeform?: boolean };
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
  basket: { label: string } | null;
  created_at: string;
};

export default function CaseDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<{ case: CaseRecord; files: CaseFile[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  async function load() {
    const res = await fetch(`/api/cases/${params.id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Case not found");
      return;
    }
    setData(json);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

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

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-8 text-center">
        <div>
          <p className="text-slate-500">{error}</p>
          <button
            onClick={() => router.push("/cases")}
            className="mt-6 rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
          >
            Back to cases
          </button>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const { case: c, files } = data;
  const photos = files.filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f.filename));
  const videos = files.filter((f) => /\.(mp4|mov|webm)$/i.test(f.filename));
  const notes = c.notes ?? [];
  const vehicleName = c.vehicle_slug ? c.vehicle_slug.split("-").slice(0, -1).join(" ") : "Vehicle pending";

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-4xl px-8 py-10">
        <button
          onClick={() => router.push("/cases")}
          className="mb-4 flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
        >
          <ArrowLeft className="h-4 w-4" />
          All cases
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold capitalize text-slate-900">{vehicleName}</h1>
            <p className="mt-1 flex items-center gap-4 text-sm text-slate-500">
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
            </p>
          </div>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium capitalize text-indigo-700">
            {c.status.replace(/_/g, " ")}
          </span>
        </div>

        {(photos.length > 0 || videos.length > 0) && (
          <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Photos & video</h2>
            <div className="mt-3 flex flex-wrap gap-3">
              {photos.map((f) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={f.id} src={f.url} alt={f.filename} className="h-28 w-28 rounded-lg object-cover" />
              ))}
              {videos.map((f) => (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video key={f.id} src={f.url} controls className="h-28 rounded-lg" />
              ))}
            </div>
          </section>
        )}

        {c.transcript && (
          <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Initial handoff</h2>
            <p className="mt-3 text-sm text-slate-700">
              {showFullTranscript || c.transcript.length <= 220
                ? c.transcript
                : `${c.transcript.slice(0, 220)}...`}
            </p>
            {c.transcript.length > 220 && (
              <button
                onClick={() => setShowFullTranscript((s) => !s)}
                className="mt-2 text-xs font-medium text-indigo-600 hover:underline"
              >
                {showFullTranscript ? "Show less" : "View full transcript"}
              </button>
            )}
          </section>
        )}

        {c.parts && c.parts.id?.length > 0 && (
          <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identified parts</h2>
              <button
                onClick={() => router.push(`/track/procurement?case=${c.id}`)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Compare suppliers
              </button>
            </div>
            {c.parts.freeform && (
              <p className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                No OEM catalogue for this vehicle — parts read from notes
              </p>
            )}
            <ul className="mt-3 space-y-2">
              {c.parts.name.map((name, i) => (
                <li
                  key={c.parts!.id[i]}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm text-slate-800"
                >
                  {c.parts!.image[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.parts!.image[i]} alt={name} className="h-10 w-10 rounded object-contain" />
                  ) : (
                    <FileText className="h-5 w-5 text-slate-300" />
                  )}
                  {name}
                </li>
              ))}
            </ul>
          </section>
        )}

        {c.basket?.label && (
          <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Chosen basket</h2>
            <p className="mt-2 text-sm text-slate-700">{c.basket.label}</p>
          </section>
        )}

        <section className="mt-6 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Notes</h2>
          <div className="mt-3 space-y-2">
            {notes.length === 0 && <p className="text-sm text-slate-400">No additional notes yet.</p>}
            {notes.map((n, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <p>{n.text}</p>
                <p className="mt-1 text-xs text-slate-400">{new Date(n.at).toLocaleString()}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <input
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="Add a finding or update..."
              className="flex-1 rounded-md border px-3 py-2 text-sm text-slate-900"
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button
              onClick={addNote}
              disabled={addingNote || !noteText.trim()}
              className="flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              <Plus className="h-4 w-4" />
              Add
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
