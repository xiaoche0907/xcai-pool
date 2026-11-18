import "dotenv/config";
import { openDatabase } from "../../../packages/db/src/index.js";
import { FramePoolService } from "./service.js";
import { createApp } from "./app.js";
const { db, client } = openDatabase(process.env.DATABASE_URL!);
const app = createApp(new FramePoolService(db, process.cwd()), {
  admin: process.env.ADMIN_API_KEY ?? "",
  viewer: process.env.VIEWER_API_KEY ?? "",
});
app.addHook("onClose", async () => {
  await client.end();
});
await app.listen({
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 4310),
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => {
    void app.close();
  });
