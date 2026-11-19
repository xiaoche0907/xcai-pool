import { spawn } from "node:child_process";
import path from "node:path";
import {
  AppError,
  uuidSchema,
  modelKeySchema,
} from "../../contracts/src/index.js";
export type CliResult = {
  stdout: string;
  stderr: string;
  pid?: number;
  code: number | null;
  durationMs: number;
};
export type Runner = (args: string[]) => Promise<CliResult>;
export const SUPPORTED_CLI_VERSION = "1.2.0";
export function redact(value: unknown): any {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /token|password|secret|cookie|credential|nickname|phone|email|ownerUuid|ownerId|accountName|accountId/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  if (typeof value !== "string") return value;
  return value
    .replace(
      /("[^"\n]*(?:token|password|secret|cookie|authorization)"\s*:\s*)"(?:\\.|[^"\\])*"/gi,
      '$1"[REDACTED]"',
    )
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/(\/upload-images\/)[a-f0-9]{32}\//gi, "$1[REDACTED]/")
    .replace(
      /([?&](?:token|signature|credential|auth|sign)[^=\s]*=)[^&\s"']+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(\b(?:token|password|secret|cookie|authorization)\s*[:=]\s*)[^\s,;]+/gi,
      "$1[REDACTED]",
    );
}
export function normalizeCreatedProject(data: any) {
  const uuid = data.projectMeta?.uuid;
  if (!uuidSchema.safeParse(uuid).success)
    throw new AppError("CLI_RESPONSE_INVALID", "缺少 projectMeta.uuid", 502);
  return { projectUuid: uuid, title: data.projectMeta.name };
}
export function normalizeCreatedNode(data: any) {
  const nodeKey = data.nodeKey ?? data.newNodeKey;
  if (typeof nodeKey !== "string")
    throw new AppError("CLI_RESPONSE_INVALID", "缺少节点 key", 502);
  return {
    nodeKey,
    connections: data.connections ?? [],
    node: data.reactFlowNode ?? data,
  };
}
export class LibTVCLIAdapter {
  constructor(private runner: Runner) {}
  private async query(args: string[]) {
    const result = await this.runner(args);
    if (result.code !== 0) {
      const capacity = result.stderr.includes("1200000138");
      throw new AppError(
        capacity
          ? "LIBTV_GALLERY_CAPACITY_BLOCKED"
          : result.stderr.includes("401")
            ? "LIBTV_NOT_AUTHENTICATED"
            : "LIBTV_CLI_FAILED",
        capacity ? "LibTV 图库空间不足" : "LibTV 只读查询失败",
        502,
      );
    }
    try {
      const text = result.stdout.trim();
      try {
        return JSON.parse(text);
      } catch {
        return text
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
      }
    } catch {
      throw new AppError("CLI_RESPONSE_INVALID", "CLI 返回无法解析", 502);
    }
  }
  async version() {
    const result = await this.runner(["--version"]);
    if (result.code !== 0 || result.stdout.trim() !== SUPPORTED_CLI_VERSION)
      throw new AppError(
        "CLI_VERSION_MISMATCH",
        "仅允许已核验的 LibTV CLI 1.2.0",
        503,
      );
    return result.stdout.trim();
  }
  async accountInfo() {
    return (await this.accountIdentity()).diagnosis;
  }
  async accountIdentity() {
    const d = await this.query(["account", "info"]);
    if (!d.user || !d.activeAccount)
      throw new AppError("CLI_RESPONSE_INVALID", "账号返回缺少必要字段", 502);
    return {
      userUuid: typeof d.user.uuid === "string" ? d.user.uuid : null,
      diagnosis: {
        authenticated: true,
        identity: "已授权用户（身份已脱敏）",
        activeSpace:
          d.activeAccount.accountType === 1 ? "个人空间" : "团队空间",
        spacesCount: d.accountsCount,
        membershipEffective: !!d.activeAccount.memberAccount?.effective,
      },
    };
  }
  async searchModels(type: "image" | "video") {
    const d = await this.query(["model", "search", "--type", type]);
    if (!Array.isArray(d.matches))
      throw new AppError("CLI_RESPONSE_INVALID", "目录返回缺少 matches", 502);
    return d.matches;
  }
  getModelSchema(key: string) {
    modelKeySchema.parse(key);
    return this.query(["model", key]);
  }
  async listProjects() {
    const all: any[] = [];
    for (let page = 1; page <= 100; page++) {
      const d = await this.query([
        "project",
        "list",
        "--team-id",
        "0",
        "--workspace",
        "0",
        "--page",
        String(page),
        "--page-size",
        "50",
      ]);
      if (!Array.isArray(d.projectMetaList) || !Number.isInteger(d.total))
        throw new AppError("CLI_RESPONSE_INVALID", "画布列表格式异常", 502);
      all.push(
        ...d.projectMetaList.map((p: any) => ({
          projectUuid: p.uuid,
          title: p.name,
        })),
      );
      if (all.length >= d.total) return all;
    }
    throw new AppError("CLI_RESULT_LIMIT", "画布列表超过只读查询上限", 502);
  }
  async canvas(uuid: string) {
    uuidSchema.parse(uuid);
    const d = await this.query(["project", uuid]);
    if (
      d.projectUuid !== uuid ||
      !Array.isArray(d.nodes) ||
      !Array.isArray(d.edges)
    )
      throw new AppError("CLI_RESPONSE_INVALID", "画布摘要结构异常", 502);
    return {
      projectUuid: uuid,
      nodes: d.nodes.map((n: any) => ({
        nodeKey: n.id,
        displayName: n.name,
        nodeType: n.type,
        position: n.position,
      })),
      edges: d.edges.map((e: any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    };
  }
  async listNodes(uuid: string) {
    uuidSchema.parse(uuid);
    return this.query(["node", "list", "-p", uuid]);
  }
  async getNode(uuid: string, nodeKey: string) {
    uuidSchema.parse(uuid);
    if (!/^[\w-]{1,150}$/.test(nodeKey))
      throw new AppError("INVALID_NODE", "非法 nodeKey", 400);
    return redact(await this.query(["node", nodeKey, "-p", uuid]));
  }
  async runNode(): Promise<never> {
    throw new AppError("GENERATION_DISABLED", "P1-A 禁止实际生成", 403);
  }
}
export function createReadOnlyRunner(options: {
  binary: string;
  configDir: string;
  workDir: string;
  timeoutMs?: number;
  onResult: (args: string[], result: CliResult) => Promise<void>;
}): Runner {
  return async (args) => {
    // Defense in depth: the process boundary itself accepts only reviewed read commands.
    const allowed =
      (args.length === 1 && args[0] === "--version") ||
      args.join(" ") === "account info" ||
      (args[0] === "model" &&
        ((args.length === 2 &&
          modelKeySchema.safeParse(args[1]).success &&
          args[1] !== "search") ||
          (args.length === 4 &&
            args[1] === "search" &&
            args[2] === "--type" &&
            ["image", "video"].includes(args[3])))) ||
      (args[0] === "project" &&
        ((args.length === 2 && uuidSchema.safeParse(args[1]).success) ||
          (args[1] === "list" &&
            args.length === 10 &&
            args[2] === "--team-id" &&
            args[3] === "0" &&
            args[4] === "--workspace" &&
            args[5] === "0" &&
            args[6] === "--page" &&
            /^\d+$/.test(args[7]) &&
            args[8] === "--page-size" &&
            args[9] === "50"))) ||
      (args[0] === "node" &&
        args.length === 4 &&
        (args[1] === "list" || /^[\w-]+$/.test(args[1])) &&
        args[2] === "-p" &&
        uuidSchema.safeParse(args[3]).success);
    if (
      !allowed ||
      args.some((v) =>
        [
          "--run",
          "-r",
          "create",
          "upload",
          "use",
          "delete",
          "logout",
          "login",
        ].includes(v),
      )
    )
      throw new AppError(
        "CLI_OPERATION_FORBIDDEN",
        "P1-A 子进程只允许审核过的只读命令",
        403,
      );
    const env: NodeJS.ProcessEnv = {
      LIBTV_CONFIG_DIR: path.resolve(options.configDir),
    };
    for (const key of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "HOME",
      "LANG",
      "LC_ALL",
    ])
      if (process.env[key]) env[key] = process.env[key];
    const start = Date.now();
    const result = await new Promise<CliResult>((resolve, reject) => {
      const child = spawn(options.binary, args, {
        shell: false,
        cwd: options.workDir,
        env,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "",
        stderr = "",
        limit = false,
        timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs ?? 60000);
      child.stdout.setEncoding("utf8").on("data", (chunk) => {
        stdout += chunk;
        if (Buffer.byteLength(stdout) > 8_000_000) {
          limit = true;
          child.kill();
        }
      });
      child.stderr.setEncoding("utf8").on("data", (chunk) => {
        stderr += chunk;
        if (Buffer.byteLength(stderr) > 1_000_000) {
          limit = true;
          child.kill();
        }
      });
      child.once("error", () => {
        clearTimeout(timer);
        reject(new AppError("CLI_START_FAILED", "CLI 子进程启动失败", 502));
      });
      child.once("close", (code) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          pid: child.pid,
          code: limit || timedOut ? -1 : code,
          durationMs: Date.now() - start,
        });
      });
    });
    await options.onResult(args, {
      ...result,
      stdout: "[read response omitted]",
      stderr: String(redact(result.stderr)),
    });
    return result;
  };
}
