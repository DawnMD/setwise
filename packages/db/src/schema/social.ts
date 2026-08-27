import { relations, sql } from "drizzle-orm";
import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { friendshipStatusEnum, visibilityFieldEnum, visibilityLevelEnum } from "./enums";

/**
 * One row per pair, in either direction. The unique index is on the ordered
 * pair rather than on (requester, addressee), so A->B and B->A cannot both
 * exist and a second request just resolves against the pending one.
 */
export const friendships = pgTable(
  "friendships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    addresseeId: text("addressee_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: friendshipStatusEnum("status").default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("friendships_pair_uq").on(
      sql`least(${table.requesterId}, ${table.addresseeId})`,
      sql`greatest(${table.requesterId}, ${table.addresseeId})`,
    ),
    index("friendships_addressee_idx").on(table.addresseeId, table.status),
  ],
);

/**
 * Absence of a row means private. Nothing here is opt-out: a user with no rows
 * shares nothing, so a bug that fails to read this table fails closed.
 */
export const visibility = pgTable(
  "visibility",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    field: visibilityFieldEnum("field").notNull(),
    level: visibilityLevelEnum("level").default("private").notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.field] })],
);

export const friendshipsRelations = relations(friendships, ({ one }) => ({
  requester: one(user, {
    fields: [friendships.requesterId],
    references: [user.id],
    relationName: "requestedFriendships",
  }),
  addressee: one(user, {
    fields: [friendships.addresseeId],
    references: [user.id],
    relationName: "receivedFriendships",
  }),
}));

export const visibilityRelations = relations(visibility, ({ one }) => ({
  user: one(user, { fields: [visibility.userId], references: [user.id] }),
}));

export type Friendship = typeof friendships.$inferSelect;
export type Visibility = typeof visibility.$inferSelect;
