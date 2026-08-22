import * as React from "react";

/**
 * True from the first time something is opened, and true forever after.
 *
 * Pairs with `React.lazy` for the drawers and dialogs that start closed. Not
 * rendering them at all until they are opened keeps their code out of the
 * screen's initial download; keeping them rendered afterwards means the close
 * animation gets to finish, and the chunk is already in memory by then.
 *
 * The `|| open` is what makes it usable on the render where it flips: the
 * effect has not run yet, and the drawer has to be in the tree that same frame
 * or it opens a beat late.
 */
export function useLazyMount(open: boolean): boolean {
  const [everOpened, setEverOpened] = React.useState(open);

  // Adjusted during render rather than in an effect. React re-runs this
  // component before committing anything, so the drawer is in the tree in the
  // same frame it was opened in — an effect would put it one paint late, which
  // on a drawer is a visible stutter.
  if (open && !everOpened) setEverOpened(true);

  return everOpened;
}
