/**
 * A planned target for one exercise, and how it reads.
 *
 * Lives here rather than beside the plan builder because the logger renders the
 * same string: the point of setting a target is seeing it while you train, not
 * while you plan.
 */

export type Targets = {
  targetSets: number | null;
  targetRepLow: number | null;
  targetRepHigh: number | null;
  targetRpe: number | null;
};

/** "3 × 8–12 @ 8", with whatever was left blank simply absent. */
export function describeTargets(targets: Targets): string | null {
  const parts: string[] = [];

  if (targets.targetSets !== null) parts.push(`${targets.targetSets} ×`);

  if (targets.targetRepLow !== null && targets.targetRepHigh !== null) {
    parts.push(
      targets.targetRepLow === targets.targetRepHigh
        ? String(targets.targetRepLow)
        : `${targets.targetRepLow}–${targets.targetRepHigh}`,
    );
  } else if (targets.targetRepLow !== null) {
    parts.push(`${targets.targetRepLow}+`);
  } else if (targets.targetRepHigh !== null) {
    parts.push(`up to ${targets.targetRepHigh}`);
  }

  if (targets.targetRpe !== null) parts.push(`@ ${targets.targetRpe}`);

  return parts.length > 0 ? parts.join(" ") : null;
}
