import "dotenv/config";
import { openDatabase } from "../../packages/db/src/index.js";
import { FramePoolService } from "../../apps/api-server/src/service.js";
const { db, client } = openDatabase(process.env.DATABASE_URL!);
try {
  const service = new FramePoolService(db, process.cwd());
  console.log(await service.importEvidence("bootstrap"));
} finally {
  await client.end();
}
