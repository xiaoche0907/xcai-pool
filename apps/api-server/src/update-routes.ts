import { readFile } from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../../../packages/contracts/src/index.js";
import {
  commitPattern,
  git,
  installBlocker,
  latestCommit,
  type InstallRequest,
  type UpdateResult,
} from "../../../tools/p1/update-source.js";

export function registerUpdateRoutes(app: FastifyInstance, root: string) {
  // Capture the running revision at startup, independently of later Git changes.
  const running = Promise.all([
    readFile(path.join(root, "package.json"), "utf8")
      .then((text) => String(JSON.parse(text).version))
      .catch(() => null),
    git(root, "rev-parse", "HEAD").catch(() => null),
  ]);
  let updating = false;
  const supervised = process.env.XCAIPOOL_SUPERVISED === "1";
  let result = process.env.XCAIPOOL_UPDATE_RESULT
    ? (JSON.parse(process.env.XCAIPOOL_UPDATE_RESULT) as UpdateResult)
    : null;
  if (supervised) process.on("message", receiveResult);
  function receiveResult(message: { type?: string; result?: UpdateResult }) {
    if (message?.type !== "update-result" || !message.result) return;
    result = message.result;
    updating = false;
  }
  app.addHook("onClose", async () => {
    process.off("message", receiveResult);
  });

  async function blocker() {
    if (!supervised || !process.connected)
      return "请使用 corepack pnpm start 启动服务以启用安装。";
    return installBlocker(root).catch(() => "此安装缺少可用的 Git 工作目录。");
  }

  app.get("/api/v1/admin/update", async () => {
    const [version, current] = await running;
    return { version, current, updating, result };
  });
  app.post("/api/v1/admin/update/check", async () => {
    const [[, current], reason, latest] = await Promise.all([
      running,
      blocker(),
      latestCommit(root).catch((error: Error) => {
        throw new AppError("UPDATE_SOURCE_UNAVAILABLE", error.message, 502);
      }),
    ]);
    return {
      latest: latest.commit,
      source: latest.source,
      available: Boolean(current && current !== latest.commit),
      reason: latest.gitIssue ?? reason,
    };
  });
  app.post("/api/v1/admin/update/install", async (req, reply) => {
    const { commit } = z
      .object({ commit: z.string().regex(commitPattern) })
      .strict()
      .parse(req.body);
    if (updating)
      throw new AppError("UPDATE_IN_PROGRESS", "更新正在进行。", 409);
    const reason = await blocker();
    if (reason) throw new AppError("UPDATE_NOT_AVAILABLE", reason, 409);
    if (updating)
      throw new AppError("UPDATE_IN_PROGRESS", "更新正在进行。", 409);
    updating = true;
    result = null;
    try {
      const request: InstallRequest = { type: "install", commit };
      await new Promise<void>((resolve, reject) => {
        process.send!(request, (error) => (error ? reject(error) : resolve()));
      });
    } catch {
      updating = false;
      throw new AppError("UPDATE_NOT_AVAILABLE", "无法联系本地更新进程。", 503);
    }
    return reply.code(202).send({ accepted: true });
  });
}
