import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
export function openDatabase(url: string) {
  const client = postgres(url, { max: 5, onnotice: () => {} });
  return { db: drizzle(client, { schema, casing: "snake_case" }), client };
}
export type Database = ReturnType<typeof openDatabase>["db"];
