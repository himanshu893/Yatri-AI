import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { TopNav } from "../layout/TopNav";
import { SiteFooter } from "../layout/SiteFooter";
import { setLandingDraft } from "../lib/planSession";

const HERO_IMG =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCuhbOh8E6GLRpKxl4gZlmxzewqxjKaQNepMEiSW6Pyf11blshvGHNsTXbn1kyA-MlVvzCCZIvVZpoS3cNxn9fYYOzF2NhyK63zISWENdkXeMTC7OhtjTqKhwgAzXhWL-R6ExgJcjD1rMw1lLWDOlijdkghqqnVSaT92iPQmLDTULrx6lRfqoBDdyR7g2ksjbUXF_TEAbMtoWU52aKdK4IHywu_MlXQJK39mSTM-wtozWmrGFdCVSNUq_ECsMz2ITyZMCADa3W2TQto";

const BENTO = [
  {
    title: "Himachal trails",
    sub: "Mountains & valleys",
    span: "md:col-span-2 md:row-span-2",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuBrRMudvRSCXARdWxEwC6y39KBfgZpDiQvVqe0vRM5SIsrY_9Pqy0NBsNNAC1xA7FZkIKOUdkAkBXN76KzwLdHFqrbU7sO9WXQVOEmNo4YXgQt7kFP0js8HzcmaNXNLod3UMtQbffUByIJz46bbp_04KEpFf-cZblVenFaWxDWaOMZJs3pOQ92lGuMmIJRBxFCJEVq5EtL3D60KUCdpixPLdOgL6R5K5C8o_6saKXqL_6zRvpM5mZpnrJdUdOAg0tbl9Xl6Y0DFfYbR",
  },
  {
    title: "Kerala backwaters",
    sub: "Houseboats & monsoon",
    span: "md:col-span-2",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDxB1UumAki97KhVrxxhJPOOb3hDRLa7MjHqvPeiljwb_Y4T9J0M17-csxob7INXb6eP0xd6CjaQQmdN8vrE41HojKp8GCS9NM3qEofLf5sO7KiOctzKSDOi9xzFUh50tLOIbXd79RQnUvGFhOrvtHj_uEt_okGqK6_H4_cI1HyKOXjJ-IKCAWOW8wJVv6ouuJA76fv9xWXG_t5SuinXyL-fuLfXfcwpIlRUveD1utSQcRW9VazLk107OTmKcFjtj6iLhHkJLDaVkII",
  },
  {
    title: "Rajasthan",
    sub: "Forts & dunes",
    span: "",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCoZrrvDpN7O2otOVnW9OP2Z_9pFQ9XKt4LB3ciJtBebtjKkFo_dd3jatM1vduEFbcs9mJGLwC8qI87PFvinpjW6OH44ZAarQNzjcjuxDigAZbj6a6tEkFtkPC-wLcMA7JDhsgoMjaVtPig3QQRbBGpwoV5ML7AyzyXBDeuZP9VPA-IZ4vMzefx30UpyTAwIz1sa4iAj-GaBshTHcBTlwuxeSgqyYST0gU5D9JDwJtITo8mjOt422P0H3BiCMbi1doUyZp7f4kDqp0S",
  },
  {
    title: "Goa coast",
    sub: "Beaches & sunsets",
    span: "",
    img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCQzYTlZY7BaPQxO8FtIXOMXLdMi8Jn1Y848aHnESv-rnv1utTJfo4s5IO_nhNm8kVZvrEd46wyI7kMfyNY-8sMY1l9IJyXh4jdkF_mDoaKFmUNCNQ1H0yySFIEn5p_phNfnZ4qkW1t4y6fGAqzRr0giMr4Hx3b_7k4fb7c4q-OOXcs1HWQv9WyP7OigqePU4OFM8h1DYKO7E3pTrhJnYpQGZkpbXMOyhSJx5PNeBTuCrCRzGqJrFm56eH563XxuwAr893CXFMAyNBz",
  },
];

const BUDGET_MAP: Record<string, number> = {
  Economy: 30000,
  "Mid-Range": 70000,
  Luxury: 180000,
};

const PEOPLE_MAP: Record<string, number> = {
  Solo: 1,
  Couple: 2,
  Family: 4,
  Friends: 4,
};

export function LandingPage() {
  const navigate = useNavigate();
  const [dest, setDest] = useState("");
  const [origin, setOrigin] = useState("Delhi");
  const [budgetTier, setBudgetTier] = useState("Mid-Range");
  const [durationDays, setDurationDays] = useState("5");
  const [travelType, setTravelType] = useState("Couple");

  function onGenerate(e: React.FormEvent) {
    e.preventDefault();
    const days = Math.max(1, parseInt(durationDays, 10) || 5);
    const nights = Math.max(1, days - 1);
    setLandingDraft({
      destination: dest.trim() || "India",
      budget: BUDGET_MAP[budgetTier] ?? 70000,
      nights,
      num_people: PEOPLE_MAP[travelType] ?? 2,
      origin: origin.trim() || "Delhi",
    });
    navigate("/plan");
  }

  return (
    <div className="flex min-h-screen flex-col bg-surface font-body text-ink selection:bg-primary-fixed">
      <TopNav />

      <section className="relative flex min-h-[780px] items-center justify-center overflow-hidden px-6 py-16">
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_IMG}
            alt=""
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-surface" />
        </div>
        <div className="relative z-10 mx-auto w-full max-w-5xl">
          <div className="mb-10 text-center">
            <h1 className="font-headline text-5xl font-extrabold tracking-tight text-white drop-shadow-lg md:text-7xl">
              Your Personal
              <br />
              <span className="text-white/90">Digital Curator.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg font-medium text-white/90 drop-shadow-md md:text-xl">
              AI itineraries for India — weather-aware, budget-smart, with real
              hotels and maps.
            </p>
          </div>

          <form
            onSubmit={onGenerate}
            className="glass-panel mx-auto max-w-4xl rounded-2xl p-8 shadow-2xl md:p-10"
          >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-5">
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  Origin
                </label>
                <input
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Starting city?"
                  className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm transition-all focus:bg-surface-lowest focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  Destination
                </label>
                <input
                  value={dest}
                  onChange={(e) => setDest(e.target.value)}
                  placeholder="Where to?"
                  className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm transition-all focus:bg-surface-lowest focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  Budget
                </label>
                <select
                  value={budgetTier}
                  onChange={(e) => setBudgetTier(e.target.value)}
                  className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm focus:ring-2 focus:ring-primary"
                >
                  <option>Economy</option>
                  <option>Mid-Range</option>
                  <option>Luxury</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  Duration (days)
                </label>
                <input
                  value={durationDays}
                  onChange={(e) => setDurationDays(e.target.value)}
                  placeholder="Days"
                  type="number"
                  min={1}
                  className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="px-1 text-xs font-bold uppercase tracking-widest text-muted">
                  Travel type
                </label>
                <select
                  value={travelType}
                  onChange={(e) => setTravelType(e.target.value)}
                  className="w-full rounded-xl border-0 bg-surface-highest px-4 py-3 text-sm focus:ring-2 focus:ring-primary"
                >
                  <option>Solo</option>
                  <option>Couple</option>
                  <option>Family</option>
                  <option>Friends</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="mt-8 w-full rounded-full bg-gradient-to-r from-primary to-secondary py-4 font-headline text-sm font-bold text-white shadow-lg transition-all duration-300 hover:scale-[1.01] hover:shadow-primary/30 active:scale-[0.99]"
            >
              Generate AI Trip
            </button>
            <p className="mt-3 text-center text-xs text-muted">
              Opens the AI planner — refine your place pin, then finalize.
            </p>
          </form>
        </div>
      </section>

      <section className="bg-surface px-6 py-24">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 flex flex-col items-end justify-between gap-4 md:flex-row">
            <div className="max-w-xl">
              <h2 className="font-headline text-3xl font-extrabold tracking-tight md:text-4xl">
                Trending collections
              </h2>
              <p className="mt-4 leading-relaxed text-muted">
                Inspiration for your next India trip — tap below to start from
                the planner.
              </p>
            </div>
            <Link
              to="/plan"
              className="flex items-center gap-2 font-bold text-primary"
            >
              Open planner
              <span className="material-symbols-outlined text-lg">
                arrow_forward
              </span>
            </Link>
          </div>
          <div className="grid h-full grid-cols-1 gap-6 md:h-[560px] md:grid-cols-4">
            {BENTO.map((b) => (
              <Link
                key={b.title}
                to="/plan"
                onClick={() =>
                  setLandingDraft({
                    destination: b.title.split(" ")[0],
                    budget: 65000,
                    nights: 4,
                    num_people: 2,
                    origin: "Mumbai",
                  })
                }
                className={`group relative overflow-hidden rounded-2xl bg-surface-lowest shadow-lift ${b.span}`}
              >
                <img
                  src={b.img}
                  alt=""
                  className="absolute inset-0 h-full w-full rounded-2xl object-cover p-2 transition-transform duration-700 group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
                <div className="absolute bottom-6 left-6 text-white">
                  <h3 className="font-headline text-xl font-bold md:text-2xl">
                    {b.title}
                  </h3>
                  <p className="text-sm text-white/80">{b.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-surface-low py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="mx-auto mb-20 max-w-2xl text-center">
            <h2 className="font-headline text-3xl font-extrabold tracking-tight md:text-4xl">
              Beyond the map
            </h2>
            <p className="mt-4 text-muted">
              Live hotel rates, transport ideas, weather, and a mapped route for
              your stops.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
            {[
              {
                icon: "auto_awesome",
                t: "AI itineraries",
                d: "Day-by-day plans with safety and sunset-aware timing.",
              },
              {
                icon: "bed",
                t: "Vetted stays",
                d: "Real Google Hotels pricing via SerpAPI when available.",
              },
              {
                icon: "explore",
                t: "Smart navigation",
                d: "Itinerary pins geocoded — route preview on Google Maps.",
              },
            ].map((f) => (
              <div
                key={f.t}
                className="flex flex-col items-center rounded-2xl border border-white/40 bg-surface-lowest p-8 text-center shadow-lift"
              >
                <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary-fixed text-primary">
                  <span className="material-symbols-outlined text-3xl">
                    {f.icon}
                  </span>
                </div>
                <h3 className="font-headline mb-4 text-xl font-bold">{f.t}</h3>
                <p className="text-sm leading-relaxed text-muted">{f.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />

      <Link
        to="/plan"
        className="fixed bottom-8 right-8 z-50 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary text-white shadow-2xl transition-transform hover:scale-110 active:scale-95"
        aria-label="Open AI planner"
      >
        <span
          className="material-symbols-outlined text-3xl"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          smart_toy
        </span>
      </Link>
    </div>
  );
}
