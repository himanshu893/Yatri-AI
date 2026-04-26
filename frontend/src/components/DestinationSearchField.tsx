import { useCallback, useEffect, useState } from "react";
import { searchDestinations } from "../api/plan";
import type { DestinationCandidate, TripPlanRequest } from "../types";

type Props = {
  value: TripPlanRequest;
  onChange: (next: TripPlanRequest) => void;
};

export function DestinationSearchField({ value, onChange }: Props) {
  const [q, setQ] = useState(value.destination || "");
  const [candidates, setCandidates] = useState<DestinationCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    const t = term.trim();
    if (t.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const res = await searchDestinations(t, 10);
      setCandidates(res.candidates);
      setSearched(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Search failed");
      setCandidates([]);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = q.trim();
    if (t.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    const id = window.setTimeout(() => runSearch(t), 400);
    return () => clearTimeout(id);
  }, [q, runSearch]);

  function pick(c: DestinationCandidate) {
    onChange({
      ...value,
      destination: c.name,
      destination_label: c.label,
      destination_latitude: c.lat,
      destination_longitude: c.lng,
    });
  }

  function useTypedOnly() {
    const t = q.trim();
    if (t.length < 2) return;
    onChange({
      ...value,
      destination: t,
      destination_label: null,
      destination_latitude: null,
      destination_longitude: null,
    });
  }

  const picked =
    value.destination_latitude != null && value.destination_longitude != null;

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
        Search & pick place
      </label>
      <input
        type="text"
        value={q}
        onChange={(e) => {
          const v = e.target.value;
          setQ(v);
          onChange({
            ...value,
            destination: v,
            destination_label: null,
            destination_latitude: null,
            destination_longitude: null,
          });
        }}
        placeholder="Manali, Goa, Hampi…"
        className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm text-ink transition-all focus:bg-surface-lowest focus:ring-2 focus:ring-primary"
      />
      {loading && (
        <div className="shimmer rounded-lg px-3 py-2 text-xs text-muted">
          Searching Open-Meteo + Google Maps…
        </div>
      )}
      {err && <p className="text-xs text-red-600">{err}</p>}
      {candidates.length > 0 && (
        <ul className="max-h-48 space-y-2 overflow-y-auto pr-1">
          {candidates.map((c) => {
            const sel =
              picked &&
              Math.abs((value.destination_latitude ?? 0) - c.lat) < 1e-5 &&
              Math.abs((value.destination_longitude ?? 0) - c.lng) < 1e-5;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className={`w-full rounded-xl px-3 py-2.5 text-left text-sm transition-all ${
                    sel
                      ? "bg-white shadow-md ring-2 ring-primary/40"
                      : "bg-surface-low hover:bg-surface-high"
                  }`}
                >
                  <span className="font-headline font-semibold text-ink">
                    {c.name}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">
                    {c.label}
                  </span>
                  <span className="mt-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-tight text-primary">
                    {c.source === "open_meteo" ? "Region" : "Maps"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {searched && !loading && candidates.length > 0 && (
        <button
          type="button"
          onClick={useTypedOnly}
          className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
        >
          Use typed text only (approximate)
        </button>
      )}
      {searched && !loading && candidates.length === 0 && q.trim().length >= 2 && (
        <p className="text-xs text-muted">
          No matches — continue with your text; weather will auto-detect.
        </p>
      )}
    </div>
  );
}
