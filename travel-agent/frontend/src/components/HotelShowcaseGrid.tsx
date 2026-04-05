import { motion } from "framer-motion";

const POOL_IMAGES = [
  "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800&q=80",
  "https://images.unsplash.com/photo-1582719508461-905c673771fd?w=800&q=80",
  "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800&q=80",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800&q=80",
  "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800&q=80",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800&q=80",
];

type Props = {
  hotels: Record<string, unknown>[];
  onViewOnMap: () => void;
  subtitle?: string;
};

export function HotelShowcaseGrid({
  hotels,
  onViewOnMap,
  subtitle = 'Hand-picked from live search for your trip.',
}: Props) {
  if (!hotels.length) return null;

  const list = hotels.slice(0, 6);

  return (
    <section className="space-y-8 pt-4">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <h2 className="font-headline text-3xl font-bold text-ink">
            Curated stays
          </h2>
          <p className="max-w-xl text-sm text-muted">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onViewOnMap}
          className="inline-flex items-center gap-1 self-start font-bold text-primary hover:underline sm:self-auto"
        >
          View on map
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {list.map((h, i) => {
          const name = String(h.name ?? "Hotel");
          const price = h.price != null ? Number(h.price) : null;
          const rating = h.rating != null ? Number(h.rating) : null;
          const loc = String(h.location ?? h.description ?? "").slice(0, 120);
          const img = POOL_IMAGES[i % POOL_IMAGES.length];

          return (
            <motion.article
              key={`${name}-${i}`}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.06, type: "spring", stiffness: 320, damping: 26 }}
              className="group overflow-hidden rounded-2xl border border-slate-200/50 bg-surface-lowest shadow-sm transition-all duration-300 hover:shadow-xl"
            >
              <div className="aspect-video overflow-hidden p-2">
                <img
                  src={img}
                  alt=""
                  className="h-full w-full rounded-lg object-cover transition-transform duration-500 group-hover:scale-110"
                />
              </div>
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-bold text-ink">{name}</h3>
                  {rating != null && !Number.isNaN(rating) && (
                    <div className="flex shrink-0 items-center gap-1 rounded bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">
                      <span
                        className="material-symbols-outlined text-xs"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        star
                      </span>
                      {rating.toFixed(1)}
                    </div>
                  )}
                </div>
                {loc && (
                  <p className="line-clamp-2 text-sm text-muted">{loc}</p>
                )}
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  {price != null && !Number.isNaN(price) ? (
                    <span className="text-2xl font-extrabold text-primary">
                      ₹{price.toLocaleString("en-IN")}
                      <span className="text-sm font-normal text-muted">
                        {" "}
                        / night
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm font-medium text-muted">
                      See listing for rates
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onViewOnMap}
                    className="rounded-full border border-primary px-4 py-2 text-xs font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-white"
                  >
                    On map
                  </button>
                </div>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}
