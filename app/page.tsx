import { BodyMap } from "@/components/body-map";
import type { VolumeBand } from "@/lib/math";
import { MUSCLES, type MuscleSlug } from "@/lib/muscles";

/**
 * Phase 0 has no product surface yet. This page exists to make the foundation
 * visible: every muscle region painted at a known band, so a mis-drawn or
 * mis-named path shows up here rather than in the heatmap three phases later.
 *
 * Phase 1 replaces it with the logger.
 */

const BANDS: VolumeBand[] = ["none", "low", "productive", "high"];

const SAMPLE: Partial<Record<MuscleSlug, VolumeBand>> = Object.fromEntries(
  MUSCLES.map((m, i) => [m.slug, BANDS[i % BANDS.length]]),
);

const BAND_SWATCH: Record<VolumeBand, string> = {
  none: "var(--band-none)",
  low: "var(--band-low)",
  productive: "var(--band-productive)",
  high: "var(--band-high)",
};

const BAND_LABEL: Record<VolumeBand, string> = {
  none: "0 sets",
  low: "1 to 9",
  productive: "10 to 19",
  high: "20 or more",
};

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-[720px] px-5 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Setwise</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Foundation check. Every muscle region is painted at a sample band so a mis-drawn or
          mis-named path shows up now.
        </p>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold">Weekly effective sets</h2>
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {BANDS.map((band) => (
            <li key={band} className="flex items-center gap-2">
              <span
                aria-hidden
                className="size-3.5 rounded-sm border border-border"
                style={{ background: BAND_SWATCH[band] }}
              />
              <span className="capitalize">{band}</span>
              <span className="numeric text-ink-muted">{BAND_LABEL[band]}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="grid grid-cols-2 gap-4">
        {(["front", "back"] as const).map((view) => (
          <figure
            key={view}
            className="rounded-lg border border-border bg-surface-raised p-3 text-ink"
          >
            <BodyMap view={view} bands={SAMPLE} />
            <figcaption className="mt-2 text-center text-xs text-ink-muted capitalize">
              {view}
            </figcaption>
          </figure>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">
          Muscle list <span className="numeric text-ink-muted">({MUSCLES.length})</span>
        </h2>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
          {MUSCLES.map((m) => (
            <li key={m.slug} className="flex items-baseline justify-between gap-2">
              <span>{m.displayName}</span>
              <span className="text-xs text-ink-muted">{m.bodySide}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
