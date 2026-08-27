import type { StatWindow } from "./validators";

/**
 * The window each screen opens on.
 *
 * Here rather than beside the screens themselves so a route loader can warm the
 * right one without importing the component it belongs to — which would defeat
 * the router's own code splitting and put the whole screen in the entry chunk
 * to read one number.
 */

/** Progress opens on a week: the question there is "have I trained everything". */
export const PROGRESS_DEFAULT_WINDOW: StatWindow = 7;

/** Body opens on a month: a week of weigh-ins is mostly water. */
export const BODY_DEFAULT_WINDOW: StatWindow = 30;
