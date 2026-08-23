/** Activity types shared by the database, server contracts, and client UI. */
export const ACTIVITY_KINDS = ["workout", "rest"] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
