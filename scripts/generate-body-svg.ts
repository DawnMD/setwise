/**
 * Emits `public/body-front.svg`, `public/body-back.svg` and, for inlining,
 * `src/lib/body-svg.generated.ts`.
 *
 * Every muscle region is a `<g>` whose id is the muscle's `svgPathId`, holding
 * the left and right copies of the shape. The heatmap paints a region by
 * setting `fill` on the group, so nothing downstream needs to know a region has
 * two halves.
 *
 * The figure is laid out on a standard eight-head canon against the landmark
 * table below, and every muscle is clipped to the silhouette so nothing bleeds
 * outside the body. It is still a diagram rather than an anatomical plate, but
 * the regions sit where they sit on a person.
 *
 * A bought illustration can replace all of this by keeping the group ids.
 *
 *   npm run svg:generate
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { MUSCLES, type MuscleSlug } from "../src/lib/muscles";

type Point = [number, number];

const WIDTH = 240;
const HEIGHT = 580;
/** Everything is drawn on the body's left, then reflected across this axis. */
const CENTER = 120;

/**
 * Vertical landmarks, eight heads at 68px. Kept as named constants because the
 * shapes below are only readable if you can see what they are anchored to.
 *
 *   crown 20 · chin 88 · acromion 138 · nipple 180 · navel 258
 *   crotch 318 · knee 424 · calf belly 470 · ankle 536 · sole 556
 */

/**
 * How closely the curve hugs its control points. Textbook Catmull-Rom is 1.0,
 * which overshoots on tight corners: at full tension the pectoral outline
 * bulged up over the deltoid and the trapezius spilled onto the chest, so
 * regions that are adjacent in the coordinates rendered as overlapping.
 */
const TENSION = 0.6;

/**
 * Closed Catmull-Rom through the given points, emitted as cubic beziers. Lets
 * each region be described by a handful of landmarks instead of hand-tuned
 * control points, and keeps outlines organic rather than faceted.
 */
function smoothClosedPath(points: Point[]): string {
  const n = points.length;
  const at = (i: number) => points[((i % n) + n) % n];
  const round = (v: number) => Math.round(v * 10) / 10;
  const k = TENSION / 6;

  let d = `M${round(points[0][0])},${round(points[0][1])}`;
  for (let i = 0; i < n; i += 1) {
    const [x0, y0] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [x3, y3] = at(i + 2);

    const c1x = x1 + (x2 - x0) * k;
    const c1y = y1 + (y2 - y0) * k;
    const c2x = x2 - (x3 - x1) * k;
    const c2y = y2 - (y3 - y1) * k;

    d += `C${round(c1x)},${round(c1y)} ${round(c2x)},${round(c2y)} ${round(x2)},${round(y2)}`;
  }
  return `${d}Z`;
}

const mirror = (points: Point[]): Point[] =>
  points.map(([x, y]) => [2 * CENTER - x, y] as Point);

/**
 * Closes a left-hand profile into a symmetric shape by reflecting it back up
 * the other side. The first and last points sit on the centre line, so their
 * reflections are dropped to avoid doubling them.
 */
function symmetric(profile: Point[]): Point[] {
  return [...profile, ...mirror(profile).reverse().slice(1, -1)];
}

/**
 * `profile` is a left-hand outline running top to bottom on the centre line and
 * mirrored into one symmetric shape: the head, neck and torso.
 * `paired` is a shape drawn once on the left and repeated on the right: the
 * limbs, and every muscle region.
 */
type Shape = { kind: "profile" | "paired"; points: Point[] };

const profile = (points: Point[]): Shape => ({ kind: "profile", points });
const paired = (points: Point[]): Shape => ({ kind: "paired", points });

function expand(shape: Shape): Point[][] {
  return shape.kind === "profile"
    ? [symmetric(shape.points)]
    : [shape.points, mirror(shape.points)];
}

/**
 * The body outline. Drawn as overlapping parts rather than one path, because a
 * single outline that has to route around both armpits and the crotch is far
 * harder to keep readable than five shapes that simply overlap.
 *
 * This doubles as the clip path for the muscle layer.
 */
const SILHOUETTE: Shape[] = [
  // Head: crown 20, chin 88.
  profile([
    [120, 22],
    [110, 24],
    [102, 31],
    [97, 42],
    [96, 56],
    [99, 71],
    [105, 83],
    [113, 90],
    [120, 93],
  ]),
  // Neck, running into the trapezius.
  profile([
    [120, 82],
    [105, 86],
    [102, 106],
    [106, 126],
    [120, 133],
  ]),
  // Torso: acromion 138, armpit 172, waist narrowest 248, hips widest 276.
  profile([
    [120, 112],
    [98, 118],
    [76, 128],
    [64, 142],
    [61, 172],
    [65, 206],
    [74, 248],
    [70, 276],
    [76, 300],
    [92, 314],
    [120, 320],
  ]),
  // Arm, held slightly away from the ribs. A limb drawn flush against the
  // torso puts the biceps on top of the obliques, and the heatmap then reads as
  // one undifferentiated mass down the side of the body.
  paired([
    [68, 136],
    [52, 160],
    [42, 198],
    [38, 240],
    [36, 266],
    [30, 300],
    [26, 338],
    [30, 360],
    [50, 360],
    [56, 324],
    [60, 290],
    [64, 262],
    [66, 226],
    [70, 190],
    [74, 156],
  ]),
  paired([
    [28, 358],
    [50, 358],
    [47, 398],
    [29, 400],
  ]),
  // Leg: knee 424, calf belly 470, ankle 536.
  paired([
    [70, 286],
    [60, 330],
    [58, 380],
    [63, 424],
    [66, 452],
    [61, 478],
    [68, 514],
    [71, 538],
    [95, 538],
    [99, 478],
    [103, 452],
    [105, 424],
    [108, 382],
    [112, 344],
    [116, 318],
  ]),
  paired([
    [68, 534],
    [96, 534],
    [102, 556],
    [56, 558],
  ]),
];

type Region = { slug: MuscleSlug; points: Point[] };

/**
 * Regions are drawn to sit beside each other rather than on top of each other.
 * Overlapping shapes composite into a darker band that the eye reads as a fifth
 * volume level, which would make the heatmap lie.
 */
const FRONT: Region[] = [
  // Upper trapezius, the slope from neck to shoulder.
  { slug: "traps", points: [[117, 111], [103, 113], [90, 121], [84, 131], [95, 143], [110, 145], [117, 143]] },
  { slug: "side_delts", points: [[64, 130], [50, 144], [43, 175], [49, 200], [59, 196], [55, 166], [59, 142]] },
  { slug: "front_delts", points: [[86, 136], [70, 134], [60, 152], [58, 182], [70, 198], [80, 190], [84, 164]] },
  { slug: "chest", points: [[118, 154], [118, 183], [118, 212], [104, 218], [90, 214], [82, 198], [82, 172], [88, 158], [102, 154]] },
  { slug: "obliques", points: [[90, 232], [101, 228], [101, 288], [95, 294], [89, 266], [88, 248]] },
  { slug: "abs", points: [[103, 224], [118, 224], [118, 262], [118, 300], [111, 308], [103, 296], [100, 258]] },
  { slug: "biceps", points: [[68, 198], [54, 200], [44, 216], [40, 240], [42, 262], [56, 266], [66, 254], [70, 228]] },
  { slug: "forearms", points: [[62, 270], [46, 274], [36, 298], [30, 328], [32, 352], [48, 356], [56, 330], [61, 298]] },
  { slug: "adductors", points: [[118, 316], [106, 320], [104, 358], [106, 394], [113, 398], [118, 366], [118, 340]] },
  { slug: "quads", points: [[104, 316], [84, 310], [72, 344], [70, 386], [76, 422], [97, 428], [103, 398], [105, 352]] },
  { slug: "calves", points: [[74, 446], [68, 472], [72, 504], [86, 512], [101, 502], [105, 468], [99, 444], [86, 440]] },
];

const BACK: Region[] = [
  // Full trapezius: neck, out to each acromion, down to a point at T12.
  { slug: "traps", points: [[117, 106], [98, 110], [82, 127], [88, 150], [98, 176], [108, 206], [117, 232], [117, 190], [117, 148]] },
  { slug: "side_delts", points: [[64, 130], [50, 144], [43, 175], [49, 200], [59, 196], [55, 166], [59, 142]] },
  { slug: "rear_delts", points: [[86, 136], [70, 134], [60, 152], [58, 182], [70, 198], [80, 190], [84, 164]] },
  { slug: "lats", points: [[74, 200], [64, 222], [64, 250], [74, 272], [92, 280], [100, 258], [98, 234], [90, 214]] },
  { slug: "upper_back", points: [[86, 152], [74, 170], [72, 196], [84, 214], [97, 206], [96, 180], [92, 160]] },
  { slug: "lower_back", points: [[117, 236], [101, 244], [97, 274], [105, 302], [117, 304], [117, 270]] },
  { slug: "triceps", points: [[68, 198], [54, 200], [43, 216], [39, 240], [41, 262], [55, 266], [66, 254], [70, 228]] },
  { slug: "forearms", points: [[62, 270], [46, 274], [36, 298], [30, 328], [32, 352], [48, 356], [56, 330], [61, 298]] },
  { slug: "glutes", points: [[117, 296], [90, 294], [75, 314], [73, 342], [87, 358], [110, 352], [117, 340], [117, 318]] },
  { slug: "hamstrings", points: [[112, 362], [82, 358], [71, 386], [71, 416], [81, 432], [104, 430], [111, 400]] },
  { slug: "calves", points: [[74, 446], [68, 472], [72, 504], [86, 512], [101, 502], [105, 468], [99, 444], [86, 440]] },
];

function renderRegion({ slug, points }: Region): string {
  const muscle = MUSCLES.find((m) => m.slug === slug);
  if (!muscle) throw new Error(`Unknown muscle slug in body outline: ${slug}`);
  return [
    `      <g id="${muscle.svgPathId}" class="muscle" data-muscle="${muscle.slug}">`,
    `        <title>${muscle.displayName}</title>`,
    ...expand(paired(points)).map((s) => `        <path d="${smoothClosedPath(s)}" />`),
    `      </g>`,
  ].join("\n");
}

function renderSvg(view: "front" | "back", regions: Region[]): string {
  const silhouette = SILHOUETTE.flatMap(expand);
  const clipId = `body-clip-${view}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}"
     role="img" aria-label="${view === "front" ? "Front" : "Back"} view of the body's muscle groups"
     class="body body--${view}">
  <!--
    Generated by scripts/generate-body-svg.ts. Edit that, not this.

    Every group id below comes from src/lib/muscles.ts. To swap in a different
    illustration, keep the ids and the class names; nothing else is load-bearing.
  -->
  <defs>
    <clipPath id="${clipId}">
${silhouette.map((s) => `      <path d="${smoothClosedPath(s)}" />`).join("\n")}
    </clipPath>
  </defs>

  <!--
    Opacity is set on the group, not per path. The silhouette is a union of
    overlapping parts, and per-path alpha would composite every overlap into a
    darker seam across the shoulders, armpits and hips.
  -->
  <g class="body__silhouette" fill="currentColor" opacity="0.13">
${silhouette.map((s) => `    <path d="${smoothClosedPath(s)}" />`).join("\n")}
  </g>

  <g class="body__muscles" clip-path="url(#${clipId})"
     fill="currentColor" fill-opacity="0.24"
     stroke="currentColor" stroke-opacity="0.3" stroke-width="1"
     stroke-linejoin="round">
${regions.map(renderRegion).join("\n")}
  </g>
</svg>
`;
}

async function main() {
  const out = path.join(process.cwd(), "public");
  await mkdir(out, { recursive: true });

  const front = renderSvg("front", FRONT);
  const back = renderSvg("back", BACK);

  await writeFile(path.join(out, "body-front.svg"), front, "utf8");
  await writeFile(path.join(out, "body-back.svg"), back, "utf8");

  // Also emitted as a module. The heatmap has to inline the SVG to set `fill`
  // on individual regions, and importing beats reading from `public/` at
  // runtime, which is not guaranteed to exist in a standalone build.
  const moduleSource = [
    "// Generated by scripts/generate-body-svg.ts. Do not edit.",
    "",
    `export const BODY_FRONT_SVG = ${JSON.stringify(front)};`,
    "",
    `export const BODY_BACK_SVG = ${JSON.stringify(back)};`,
    "",
  ].join("\n");
  await writeFile(path.join(process.cwd(), "src", "lib", "body-svg.generated.ts"), moduleSource, "utf8");

  // Every region in the muscle list has to appear on the view its `bodySide`
  // claims, or the heatmap will have a muscle it can never paint.
  const frontSlugs = new Set(FRONT.map((r) => r.slug));
  const backSlugs = new Set(BACK.map((r) => r.slug));
  const problems: string[] = [];

  for (const m of MUSCLES) {
    const onFront = frontSlugs.has(m.slug);
    const onBack = backSlugs.has(m.slug);
    if (m.bodySide === "front" && !onFront) problems.push(`${m.slug}: missing from front view`);
    if (m.bodySide === "back" && !onBack) problems.push(`${m.slug}: missing from back view`);
    if (m.bodySide === "both" && !(onFront && onBack)) {
      problems.push(`${m.slug}: marked 'both' but drawn on ${onFront ? "front" : "back"} only`);
    }
  }

  if (problems.length > 0) {
    console.error("Body SVGs do not cover the muscle list:");
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `body-front.svg: ${FRONT.length} regions, body-back.svg: ${BACK.length} regions, ` +
      `all ${MUSCLES.length} muscles covered`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
