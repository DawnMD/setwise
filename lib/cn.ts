/**
 * Joins class names, dropping falsy ones.
 *
 * Deliberately not `tailwind-merge`. Conflicting utilities are a symptom of a
 * component that takes overrides it should not, and a merge step hides that
 * instead of fixing it. If two classes collide here, the fix is in the caller.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
