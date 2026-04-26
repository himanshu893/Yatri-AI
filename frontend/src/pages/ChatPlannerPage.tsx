import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { planTrip } from "../api/plan";
import { DestinationSearchField } from "../components/DestinationSearchField";
import { TopNav } from "../layout/TopNav";
import { SiteFooter } from "../layout/SiteFooter";
import { consumeLandingDraft } from "../lib/planSession";
import { saveTrip } from "../lib/tripsStorage";
import type { TripPlanRequest } from "../types";

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

type ChatMsg = { role: "user" | "assistant"; text: string };

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

export function ChatPlannerPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      text: "Hi — I'm your Yatri curator. Use the **Trip Blueprint** to lock destination (search & pick a pin), budget, and dates. Chat here for notes; when ready, tap **Finalize itinerary**.",
    },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [form, setForm] = useState<TripPlanRequest>(initialForm);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const draft = consumeLandingDraft();
    if (draft && Object.keys(draft).length) {
      setForm((f) => ({ ...f, ...draft }));
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "I've loaded your quick start from the home page — pick an exact place from search if you haven't yet, then finalize.",
        },
      ]);
    }
  }, []);

  function sendChat() {
    const t = chatInput.trim();
    if (!t) return;
    setChatInput("");
    setMessages((m) => [...m, { role: "user", text: t }]);
    setMessages((m) => [
      ...m,
      {
        role: "assistant",
        text: "Noted. The blueprint on the right drives the live plan — adjust fields there for precise control.",
      },
    ]);
  }

  async function finalize() {
    setErr(null);
    if (!form.destination.trim() || form.budget < 1000) {
      setErr("Add a destination and budget first.");
      return;
    }
    setLoading(true);
    setMessages((m) => [
      ...m,
      { role: "assistant", text: "Researching weather, hotels, transport — this can take a minute…" },
    ]);
    try {
      const res = await planTrip({
        ...form,
        travel_month: form.travel_month || undefined,
        origin: form.origin,
      });
      const trip = saveTrip(res);
      navigate(`/trip/${trip.id}`, { replace: true });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Plan failed");
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Something went wrong generating the plan. Check API keys / network and try again.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const previewImg =
    "https://lh3.googleusercontent.com/aida-public/AB6AXuCtrBMrBEtNQYKKn-LbkuJ7eYjIrOxYArB7eOT7Y6QHgvefQIjTPLf4THUQCPRTONI2sUq_UWRgnqgB5THblAoybyrMesPufIRXjXaVSHvVW5SaDBWnX3SqUlF30eyxTYn5AydQt6MyQrFwD8-lT_sL80k--M8-J5sl17qdyentq2vtXIq2I7M5bDnNJtRoD5nB_FUrDnOtMccStLTE0kH8P4sFB6vXVemmSqqFWzYSJzGEa5SGTSWP3MROs-HpW7J1tdVkdotaOhTs";

  const destTitle = form.destination_label || form.destination || "Your trip";

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <TopNav />
      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col overflow-hidden md:h-[calc(100vh-72px)] md:flex-row">
        {/* Chat column */}
        <section className="relative flex flex-1 flex-col border-slate-200/40 bg-surface-low md:border-r">
          <div className="flex items-center justify-between border-b border-slate-200/30 bg-surface/40 px-6 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-xs font-semibold uppercase tracking-widest text-muted">
                Active planning session
              </span>
            </div>
            <span className="text-xs font-medium text-muted">Yatri-Curator</span>
          </div>
          <div className="flex-1 space-y-8 overflow-y-auto p-6">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                <div
                  key={i}
                  className="ml-auto flex max-w-[85%] justify-end gap-3"
                >
                  <div className="rounded-t-xl rounded-bl-xl bg-primary px-5 py-3.5 shadow-sm">
                    <p className="text-sm leading-relaxed text-white">{msg.text}</p>
                  </div>
                </div>
              ) : (
                <div key={i} className="flex max-w-[90%] gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary shadow-lg shadow-primary/10">
                    <span
                      className="material-symbols-outlined text-lg text-white"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      auto_awesome
                    </span>
                  </div>
                  <div className="glass-panel w-full rounded-xl border border-slate-200/20 p-6 shadow-sm">
                    <span className="mb-2 block text-xs font-bold uppercase tracking-tight text-primary">
                      Digital curator
                    </span>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                      {msg.text}
                    </p>
                  </div>
                </div>
              ),
            )}
          </div>
          <div className="bg-surface-low p-6">
            {err && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            )}
            <div className="group relative mx-auto max-w-3xl">
              <div className="absolute -inset-1 rounded-xl bg-gradient-to-r from-primary/20 to-secondary/20 opacity-25 blur transition duration-500 group-focus-within:opacity-80" />
              <div className="relative flex items-center rounded-xl border border-slate-200/40 bg-surface-lowest p-2 shadow-xl shadow-primary/5">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendChat()}
                  placeholder="Add notes or questions…"
                  className="flex-1 border-none bg-transparent px-4 py-2 text-sm focus:ring-0"
                />
                <button
                  type="button"
                  onClick={sendChat}
                  className="flex items-center justify-center rounded-lg bg-primary p-2.5 text-white shadow-lg shadow-primary/20 transition-transform hover:scale-105 active:scale-95"
                >
                  <span className="material-symbols-outlined text-sm">send</span>
                </button>
              </div>
              <p className="mt-3 text-center text-[10px] font-medium text-muted/60">
                Verify bookings and travel advisories independently.
              </p>
            </div>
          </div>
        </section>

        {/* Blueprint */}
        <aside className="w-full overflow-y-auto bg-surface p-6 lg:w-[480px] lg:p-8">
          <div className="space-y-8">
            <div>
              <h2 className="font-headline text-3xl font-extrabold tracking-tight">
                Trip blueprint
              </h2>
              <p className="mt-1 text-sm text-muted">
                Live summary — this is sent to the planner API.
              </p>
            </div>

            <div className="relative">
              <div className="absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-primary/10 to-transparent opacity-50 blur" />
              <div className="relative rounded-2xl border border-white/60 bg-white/40 p-8 shadow-2xl shadow-slate-200/50 backdrop-blur-xl">
                <div className="absolute right-6 top-6">
                  <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold uppercase tracking-tight text-emerald-700">
                    Drafting
                  </span>
                </div>
                <div className="mb-8 overflow-hidden rounded-xl bg-surface-high/30 p-1.5">
                  <img
                    src={previewImg}
                    alt=""
                    className="h-48 w-full rounded-lg object-cover"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Origin
                    </label>
                    <input
                      type="text"
                      value={form.origin || ""}
                      onChange={(e) => setForm({ ...form, origin: e.target.value })}
                      placeholder="Where are you starting from?"
                      className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm text-ink transition-all focus:bg-surface-lowest focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <DestinationSearchField
                    value={form}
                    onChange={(next) => setForm(next)}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Budget ₹
                    </label>
                    <input
                      type="number"
                      min={1000}
                      step={1000}
                      value={form.budget}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          budget: Number(e.target.value) || 0,
                        })
                      }
                      className="w-full rounded-xl border-0 bg-surface-highest px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Nights
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={form.nights}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          nights: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full rounded-xl border-0 bg-surface-highest px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    Month
                  </label>
                  <select
                    value={form.travel_month ?? ""}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        travel_month: e.target.value || null,
                      })
                    }
                    className="w-full rounded-xl border-0 bg-surface-highest px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
                  >
                    <option value="">Flexible</option>
                    {MONTHS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      People
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={form.num_people}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          num_people: Number(e.target.value) || 1,
                        })
                      }
                      className="w-full rounded-xl border-0 bg-surface-highest px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      From
                    </label>
                    <input
                      value={form.origin ?? ""}
                      onChange={(e) =>
                        setForm({ ...form, origin: e.target.value })
                      }
                      className="w-full rounded-xl border-0 bg-surface-highest px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>

                <div className="mt-8 space-y-3 border-t border-slate-200/40 pt-8">
                  <div className="flex items-start gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-primary/10 bg-primary/5">
                      <span className="material-symbols-outlined text-lg text-primary">
                        location_on
                      </span>
                    </div>
                    <div>
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        Destination
                      </span>
                      <h3 className="font-headline text-xl font-bold text-ink">
                        {destTitle}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <button
                type="button"
                disabled={loading}
                onClick={finalize}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-secondary py-4 font-headline text-sm font-bold tracking-wide text-white shadow-xl shadow-primary/20 transition-transform hover:scale-[1.02] disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">
                  check_circle
                </span>
                {loading ? "Generating…" : "Finalize itinerary"}
              </button>
              <button
                type="button"
                onClick={() => navigate("/trips")}
                className="flex w-full items-center justify-center gap-2 rounded-full border border-slate-200/60 bg-surface-lowest py-4 font-headline text-sm font-bold text-ink transition-colors hover:bg-surface-low"
              >
                <span className="material-symbols-outlined text-lg">map</span>
                View saved trips
              </button>
            </div>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
