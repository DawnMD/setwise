import { BODY_BACK_SVG, BODY_FRONT_SVG } from "@/lib/body-svg.generated";
import type { VolumeBand } from "@/lib/math";
import type { MuscleSlug } from "@/lib/muscles";

const BAND_COLOR: Record<VolumeBand, string> = {
  none: "var(--band-none)",
  low: "var(--band-low)",
  productive: "var(--band-productive)",
  high: "var(--band-high)",
};

export type BodyMapProps = {
  view: "front" | "back";
  /** Band per muscle. Anything absent is painted as `none`. */
  bands?: Partial<Record<MuscleSlug, VolumeBand>>;
  /**
   * One region drawn with an outline, to show which is selected.
   *
   * It lives here rather than in a caller's `className` because a Tailwind
   * arbitrary variant would have to interpolate the slug, and Tailwind reads
   * source files statically — a class built at runtime is never generated.
   */
  outlined?: MuscleSlug | null;
  className?: string;
};

/**
 * Paints the body SVG by muscle.
 *
 * Regions are selected by `data-muscle` and scoped to this instance, because
 * the front and back views legitimately share ids (traps, side delts, forearms
 * and calves appear on both) and two elements cannot carry the same id in one
 * document. The ids are namespaced on the way in for the same reason.
 *
 * The markup itself is never rewritten beyond that, so a bought illustration
 * can replace the generated one as long as it keeps the ids.
 */
export function BodyMap({ view, bands = {}, outlined = null, className }: BodyMapProps) {
  const scope = `body-map--${view}`;
  // Namespace every id and every reference to one. Both views define a clip
  // path as well as the shared muscle groups, so without this the second view
  // rendered would clip against the first view's silhouette.
  const svg = (view === "front" ? BODY_FRONT_SVG : BODY_BACK_SVG)
    .replaceAll(/id="([\w-]+)"/g, `id="${view}-$1"`)
    .replaceAll(/url\(#([\w-]+)\)/g, `url(#${view}-$1)`);

  const rules = Object.entries(bands)
    .map(
      ([slug, band]) =>
        `.${scope} [data-muscle="${slug}"]{fill:${BAND_COLOR[band as VolumeBand]};fill-opacity:1}`,
    )
    .concat(
      outlined
        ? [
            `.${scope} [data-muscle="${outlined}"]{stroke:var(--color-foreground);stroke-width:2;paint-order:stroke}`,
          ]
        : [],
    )
    .join("");

  return (
    <div className={[scope, className].filter(Boolean).join(" ")}>
      {rules.length > 0 ? <style>{rules}</style> : null}
      <div dangerouslySetInnerHTML={{ __html: svg }} />
    </div>
  );
}
