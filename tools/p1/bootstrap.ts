import "dotenv/config";
import { openDatabase } from "../../packages/db/src/index.js";
import { FramePoolService } from "../../apps/api-server/src/service.js";
if (!process.argv.includes("--p0")) {
  console.log("新部署从空账号池启动。仅在恢复 P0 记录时使用 bootstrap --p0。");
  process.exit(0);
}
const { db, client } = openDatabase(process.env.DATABASE_URL!);
try {
  const service = new FramePoolService(db, process.cwd());
  console.log(await service.importEvidence("bootstrap"));
} finally {
  await client.end();
}
