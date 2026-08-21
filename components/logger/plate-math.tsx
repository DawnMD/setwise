import { describeLoading, loadBar } from "@/lib/plates";
import { formatWeight } from "@/lib/format";

/**
 * What to put on the bar.
 *
 * This is the one place in the app that uses more than a single accent colour.
 * Competition plates are standardised and every lifter reads them without
 * thinking, so here the colours carry meaning rather than decoration.
 *
 * Only shown for barbell work. On a dumbbell or a machine there is no bar to
 * load and the strip would be noise.
 */
export function PlateMath({ targetKg, barKg }: { targetKg: number; barKg: number }) {
  const loading = loadBar(targetKg, barKg);

  if (loading === null) {
    return <p className="text-xs text-muted-foreground">Under the {formatWeight(barKg)} kg bar.</p>;
  }

  if (loading.perSide.length === 0 && loading.remainderKg === 0) {
    return <p className="text-xs text-muted-foreground">Empty bar.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="sr-only">Per side: {describeLoading(loading)}</span>

      <div aria-hidden className="flex items-center gap-[3px]">
        <span className="h-1 w-3 rounded-sm bg-muted-foreground/50" />
        {loading.perSide.map((plate, index) => (
          <span
            key={`${plate.label}-${index}`}
            title={`${plate.label} kg`}
            className="flex w-4 items-center justify-center rounded-[2px] border"
            style={{
              background: plate.color,
              borderColor: plate.ring,
              // Height reads the weight before the colour does, which is what
              // makes the strip scannable at arm's length.
              height: `${Math.min(40, 14 + plate.kg * 1.05)}px`,
            }}
          />
        ))}
      </div>

      <span className="numeric text-xs text-muted-foreground">
        per side
        {loading.remainderKg > 0 ? (
          <span className="text-destructive"> · {formatWeight(loading.remainderKg)} kg short</span>
        ) : null}
      </span>
    </div>
  );
}
