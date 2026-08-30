import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userStates = sqliteTable("user_states", {
  userId: text("user_id").primaryKey(),
  stateJson: text("state_json").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const customBooks = sqliteTable(
  "custom_books",
  {
    userId: text("user_id").notNull(),
    id: text("id").notNull(),
    title: text("title").notNull(),
    wordCount: integer("word_count").notNull().default(0),
    objectKey: text("object_key").notNull(),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.id] }),
    index("idx_custom_books_user_updated").on(table.userId, table.updatedAt),
  ],
);
