import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { searchDestinations } from "../api/plan";
import type { DestinationCandidate, TripPlanRequest } from "../types";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const steps = [
  {
    key: "where",
    title: "Where to?",
    sub: "Search places — pick the exact spot (Open-Meteo + Google Maps via SerpAPI)",
  },
  { key: "budget", title: "Your budget", sub: "Total trip budget in INR" },
  { key: "when", title: "When", sub: "Month of travel" },
  { key: "group", title: "Group & length", sub: "Travellers and nights" },
  { key: "from", title: "Starting from", sub: "Home city or airport city" },
  { key: "review", title: "Review", sub: "Confirm and generate plan" },
] as const;

type Props = {
  value: TripPlanRequest;
  onChange: (v: TripPlanRequest) => void;
  step: number;
  onStep: (n: number) => void;
  onSubmit: () => void;
  loading: boolean;
};

function sourceBadge(src: string) {
  if (src === "open_meteo") return "Region / city";
  if (src === "google_maps") return "Maps place";
  return src;
}

export function PlanWizard({
  value,
  onChange,
  step,
  onStep,
  onSubmit,
  loading,
}: Props) {
  const meta = steps[step];
  const [searchInput, setSearchInput] = useState(value.destination || "");
  const [candidates, setCandidates] = useState<DestinationCandidate[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [manualOnly, setManualOnly] = useState(false);

  const runSearch = useCallback(async (q: string) => {
    const t = q.trim();
    if (t.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const res = await searchDestinations(t, 10);
      setCandidates(res.candidates);
      setSearched(true);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed");
      setCandidates([]);
      setSearched(true);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    if (step !== 0) return;
    const t = searchInput.trim();
    if (t.length < 2) {
      setCandidates([]);
      setSearched(false);
      return;
    }
    const id = window.setTimeout(() => runSearch(t), 400);
    return () => clearTimeout(id);
  }, [searchInput, step, runSearch]);

  function pickCandidate(c: DestinationCandidate) {
    setManualOnly(false);
    onChange({
      ...value,
      destination: c.name,
      destination_label: c.label,
      destination_latitude: c.lat,
      destination_longitude: c.lng,
    });
  }

  function useTypedOnly() {
    const t = searchInput.trim();
    if (t.length < 2) return;
    setManualOnly(true);
    onChange({
      ...value,
      destination: t,
      destination_label: null,
      destination_latitude: null,
      destination_longitude: null,
    });
  }

  const pickedCoords =
    value.destination_latitude != null && value.destination_longitude != null;

  const canNextStep0 =
    searchInput.trim().length >= 2 &&
    (pickedCoords || manualOnly || (searched && !searchLoading && candidates.length === 0));

  const canNext =
    step === 0
      ? canNextStep0
      : step === 1
        ? value.budget >= 1000
        : step === 2
          ? true
          : step === 3
            ? value.num_people >= 1 && value.nights >= 1
            : step === 4
              ? (value.origin ?? "").trim().length >= 2
              : true;

  return (
    <div className="wizard-card">
      <div className="step-dots">
        {steps.map((_, i) => (
          <span key={i} className={i <= step ? "on" : ""} />
        ))}
      </div>
      <h2 className="wizard-title">{meta.title}</h2>
      <p className="wizard-sub">{meta.sub}</p>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          className="wizard-step-body"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        >
          {step === 0 && (
            <>
              <div className="field sleek-field">
                <label htmlFor="dest">Search destination</label>
                <input
                  id="dest"
                  className="sleek-input"
                  placeholder="Try Manali, Jaipur, Alleppey…"
                  value={searchInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchInput(v);
                    setManualOnly(false);
                    onChange({
                      ...value,
                      destination: v,
                      destination_label: null,
                      destination_latitude: null,
                      destination_longitude: null,
                    });
                  }}
                  autoFocus
                />
              </div>

              {searchLoading && (
                <div className="search-hint shimmer-line">Searching places…</div>
              )}
              {searchError && <div className="error-inline">{searchError}</div>}

              {candidates.length > 0 && (
                <div className="candidate-section">
                  <p className="candidate-hint">
                    Choose one match (top results from geodata + Google Maps)
                  </p>
                  <ul className="candidate-list">
                    {candidates.map((c) => {
                      const isSel =
                        pickedCoords &&
                        Math.abs((value.destination_latitude ?? 0) - c.lat) < 1e-5 &&
                        Math.abs((value.destination_longitude ?? 0) - c.lng) < 1e-5;
                      return (
                        <li key={c.id}>
                          <button
                            type="button"
                            className={`candidate-tile ${isSel ? "selected" : ""}`}
                            onClick={() => pickCandidate(c)}
                          >
                            <span className="candidate-name">{c.name}</span>
                            <span className="candidate-meta">{c.label}</span>
                            <span className="candidate-badge">
                              {sourceBadge(c.source)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {searched && !searchLoading && candidates.length === 0 && searchInput.trim().length >= 2 && (
                <p className="search-hint">
                  No indexed matches — you can still continue with your text; weather will
                  use automatic city detection.
                </p>
              )}

              {candidates.length > 0 && (
                <button
                  type="button"
                  className="linkish-btn"
                  onClick={useTypedOnly}
                >
                  Skip pin — use my text only (approximate location)
                </button>
              )}
            </>
          )}

          {step === 1 && (
            <div className="field sleek-field">
              <label htmlFor="budget">Budget (₹)</label>
              <input
                id="budget"
                className="sleek-input"
                type="number"
                min={5000}
                step={1000}
                value={value.budget || ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    budget: Number(e.target.value) || 0,
                  })
                }
                autoFocus
              />
            </div>
          )}

          {step === 2 && (
            <div className="field sleek-field">
              <label htmlFor="month">Travel month</label>
              <select
                id="month"
                className="sleek-input"
                value={value.travel_month ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    travel_month: e.target.value || null,
                  })
                }
                autoFocus
              >
                <option value="">Flexible / current season</option>
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}

          {step === 3 && (
            <div className="row-2">
              <div className="field sleek-field">
                <label htmlFor="ppl">Travellers</label>
                <input
                  id="ppl"
                  className="sleek-input"
                  type="number"
                  min={1}
                  max={30}
                  value={value.num_people}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      num_people: Number(e.target.value) || 1,
                    })
                  }
                />
              </div>
              <div className="field sleek-field">
                <label htmlFor="nights">Nights</label>
                <input
                  id="nights"
                  className="sleek-input"
                  type="number"
                  min={1}
                  max={60}
                  value={value.nights}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      nights: Number(e.target.value) || 1,
                    })
                  }
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="field sleek-field">
              <label htmlFor="origin">Origin city</label>
              <input
                id="origin"
                className="sleek-input"
                placeholder="e.g. Mumbai, Delhi, Bengaluru"
                value={value.origin ?? ""}
                onChange={(e) =>
                  onChange({ ...value, origin: e.target.value })
                }
                autoFocus
              />
            </div>
          )}

          {step === 5 && (
            <motion.ul
              className="review-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <li>
                <strong>Destination:</strong>{" "}
                {value.destination_label || value.destination}
              </li>
              <li>
                <strong>Budget:</strong> ₹{value.budget.toLocaleString("en-IN")}
              </li>
              <li>
                <strong>Month:</strong> {value.travel_month || "Flexible"}
              </li>
              <li>
                <strong>Group:</strong> {value.num_people} people, {value.nights}{" "}
                nights
              </li>
              <li>
                <strong>From:</strong> {value.origin}
              </li>
            </motion.ul>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="btn-row">
        {step > 0 && (
          <button
            type="button"
            className="btn-secondary"
            disabled={loading}
            onClick={() => onStep(step - 1)}
          >
            Back
          </button>
        )}
        {step < steps.length - 1 ? (
          <button
            type="button"
            className="btn-gradient"
            disabled={!canNext || loading}
            onClick={() => onStep(step + 1)}
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            className="btn-gradient"
            disabled={loading}
            onClick={onSubmit}
          >
            {loading ? "Planning…" : "Generate plan"}
          </button>
        )}
      </div>
    </div>
  );
}
