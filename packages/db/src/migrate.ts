import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { openDatabase } from "./index.js";
const { db, client } = openDatabase(process.env.DATABASE_URL!);
try {
  await migrate(db, { migrationsFolder: "packages/db/migrations" });
  console.log("FramePool migrations applied.");
} finally {
  await client.end();
}
