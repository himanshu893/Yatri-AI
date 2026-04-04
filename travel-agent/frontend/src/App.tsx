import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { planTrip } from "./api/plan";
import { PlanWizard } from "./components/PlanWizard";
import { ResultsPanel } from "./components/ResultsPanel";
import type { TripPlanRequest, TripPlanResponse } from "./types";

const initialForm: TripPlanRequest = {
  destination: "",
  budget: 50000,
  travel_month: null,
  num_people: 2,
  nights: 4,
  origin: "Mumbai",
  destination_latitude: null,
  destination_longitude: null,
  destination_label: null,
};

export default function App() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<TripPlanRequest>(initialForm);
  const [result, setResult] = useState<TripPlanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSubmit() {
    setErr(null);
    setLoading(true);
    try {
      const res = await planTrip({
        ...form,
        travel_month: form.travel_month || undefined,
        origin: form.origin || "Delhi",
      });
      setResult(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setStep(0);
    setForm(initialForm);
    setErr(null);
  }

  return (
    <div className="app-shell">
      <header className="app-header glass-nav">
        <div className="logo logo-stitch">
          <span className="logo-mark logo-mark-stitch">✦</span>
          Yatri AI
        </div>
        <p className="tagline">
          Digital curator for Indian trips — search, pick your place, plan in steps.
        </p>
      </header>

      <main className="main-grid" style={{ paddingBottom: "2.5rem" }}>
        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div
              key="wizard"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
            >
              {err && <div className="error-banner">{err}</div>}
              <PlanWizard
                value={form}
                onChange={setForm}
                step={step}
                onStep={setStep}
                onSubmit={handleSubmit}
                loading={loading}
              />
              {loading && (
                <div className="loading-overlay card" style={{ marginTop: "1rem" }}>
                  <span className="spinner" />
                  Researching weather, hotels (SerpAPI), transport, and building your
                  itinerary…
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.35 }}
            >
              <ResultsPanel data={result} onReset={handleReset} />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
