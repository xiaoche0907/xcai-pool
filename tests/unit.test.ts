import { describe, it, expect, vi } from "vitest";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Ajv } from "ajv";
import { LibTVWebLogin } from "../apps/api-server/src/libtv-login.js";
import { latestCommit } from "../tools/p1/update-source.js";
import {
  normalizeModel,
  validateParameters,
  serializeSettings,
  schemaHash,
  changedPaths,
} from "../packages/model-normalizer/src/index.js";
import {
  LibTVCLIAdapter,
  normalizeCreatedNode,
  normalizeCreatedProject,
  createReadOnlyRunner,
  redact,
} from "../packages/libtv-cli-adapter/src/index.js";
it("CLI 缺失时返回安装提示且不创建账号目录", async () => {
  const directory = path.join(process.cwd(), "tests", randomUUID());
  const login = new LibTVWebLogin(directory, path.join(directory, "libtv.exe"));
  await expect(login.start(false)).rejects.toMatchObject({
    code: "LIBTV_CLI_MISSING",
  });
  await expect(login.phone("13800000000")).rejects.toMatchObject({
    code: "LIBTV_CLI_MISSING",
  });
  await expect(access(directory)).rejects.toMatchObject({ code: "ENOENT" });
});

it("Git 查询不可用时从 GitHub API 读取提交，并区分限流", async () => {
  const nonexistentRoot = path.join(process.cwd(), "tests", randomUUID());
  const sha = "a".repeat(40);
  const http = vi
    .fn()
    .mockResolvedValueOnce(Response.json({ sha }))
    .mockResolvedValueOnce(new Response(null, { status: 429 }));
  vi.stubGlobal("fetch", http);
  try {
    await expect(latestCommit(nonexistentRoot)).resolves.toMatchObject({
      commit: sha,
      source: "github-api",
      gitIssue: expect.stringContaining("Git"),
    });
    expect(http).toHaveBeenCalledWith(
      "https://api.github.com/repos/xiaoche0907/xcai-pool/commits/main",
      expect.any(Object),
    );
    await expect(latestCommit(nonexistentRoot)).rejects.toThrow("达到请求限额");
  } finally {
    vi.unstubAllGlobals();
  }
});

const load = async (key: string) =>
  JSON.parse(
    (await readFile(`docs/p0/schemas/${key}.json`, "utf8")).replace(
      /^\uFEFF/,
      "",
    ),
  );
it("按个人与团队空间分页读取画布，查询不限定在根工作区", async () => {
  const personal = "1".repeat(32);
  const workspace = "2".repeat(32);
  const team = "3".repeat(32);
  const adapter = new LibTVCLIAdapter(async (args) => {
    const response = (payload: object) => ({
      stdout: JSON.stringify(payload),
      stderr: "",
      code: 0,
      durationMs: 0,
    });
    if (args.join(" ") === "account list")
      return response({
        accounts: [
          { accountType: 1 },
          { accountType: 2, teamId: 42 },
          { accountType: 2, teamId: "42" },
        ],
      });
    expect(args).not.toContain("--workspace");
    expect(args.slice(0, 3)).toEqual(["project", "list", "--team-id"]);
    const [, , , teamId, , page] = args;
    if (teamId === "0") {
      const row =
        page === "1"
          ? { uuid: personal, name: "个人根画布" }
          : { uuid: workspace, name: "项目内画布", workspaceId: 12 };
      return response({ total: 2, projectMetaList: [row] });
    }
    expect(teamId).toBe("42");
    return response({
      total: 2,
      projectMetaList: [
        { uuid: team, name: "团队画布" },
        { uuid: workspace, name: "项目内画布" },
      ],
    });
  });
  expect(await adapter.listProjects()).toEqual([
    { projectUuid: personal, title: "个人根画布" },
    { projectUuid: workspace, title: "项目内画布" },
    { projectUuid: team, title: "团队画布" },
  ]);
});
describe("P0 Schema 转换与严格校验", () => {
  it("65 个真实 Schema 的全部模式均能编译为 JSON Schema", async () => {
    const files = await readdir("docs/p0/schemas");
    expect(files).toHaveLength(65);
    let modes = 0;
    for (const file of files) {
      const raw = await load(file.replace(".json", ""));
      const form = normalizeModel(raw, raw.modality);
      for (const mode of form.modes) {
        const normalized = normalizeModel(raw, raw.modality, mode);
        expect(() =>
          new Ajv({ strict: false }).compile(normalized.validationSchema),
        ).not.toThrow();
        modes++;
      }
    }
    expect(modes).toBeGreaterThan(100);
  });
  it("接受嵌套 settings，拒绝未知顶层和嵌套字段", async () => {
    const raw = await load("z-image"),
      data = {
        prompt: "a teapot",
        count: 1,
        settings: { quality: "1K", ratio: "1:1" },
      };
    expect(validateParameters(raw, "image", "text2image", data).valid).toBe(
      true,
    );
    expect(() =>
      validateParameters(raw, "image", "text2image", { ...data, unknown: 1 }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "image", "text2image", {
        ...data,
        settings: { quality: "1K", intruder: true },
      }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "image", "text2image", { ...data, count: 3 }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "image", "text2image", {
        ...data,
        settings: { quality: "8K" },
      }),
    ).toThrow();
  });
  it("无法确认的 whenHas 媒体条件明确阻止校验通过", async () => {
    const raw = await load("minimax-h3-hs");
    const form = normalizeModel(raw, "video", "mixed2video");
    expect(form.canValidate).toBe(false);
    expect(() =>
      validateParameters(raw, "video", "mixed2video", {
        prompt: "x",
        count: 1,
        referenceNodeKeys: ["i-a"],
      }),
    ).toThrow("未转换");
  });
  it("模式、空提示词、边界与引用数量受控", async () => {
    const raw = await load("wanx3.0"),
      data = { prompt: "test", count: 1, settings: { duration: 5 } };
    expect(() => validateParameters(raw, "video", "invalid", data)).toThrow();
    expect(() =>
      validateParameters(raw, "video", "text2video", { ...data, prompt: " " }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "video", "text2video", {
        ...data,
        settings: { duration: 31 },
      }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "video", "text2video", {
        ...data,
        settings: { duration: 2.5 },
      }),
    ).toThrow();
    expect(() =>
      validateParameters(raw, "video", "frames2video", data),
    ).toThrow();
    expect(
      validateParameters(raw, "video", "frames2video", {
        ...data,
        referenceNodeKeys: ["i-test"],
      }).valid,
    ).toBe(true);
    expect(() =>
      validateParameters(raw, "video", "frames2video", {
        ...data,
        referenceNodeKeys: ["a", "b", "c"],
      }),
    ).toThrow();
  });
  it("originalField 按当前模式映射，不接受另一个模式参数值", async () => {
    const raw = await load("MiniMax-Hailuo-2.3");
    const form = normalizeModel(raw, "video", "text2video");
    expect(form.jsonSchema.properties.settings.additionalProperties).toBe(
      false,
    );
    expect(form.warnings.length).toBeGreaterThan(0);
  });
  it("未知复杂字段安全降级，不假称完整上游校验", () => {
    const raw = {
      schema: {
        properties: {
          prompt: {},
          count: [1],
          modeType: { items: {} },
          exotic: { component: "unknown" },
        },
        config: { settings: ["exotic"], generateTypes: { text: 1 } },
      },
    };
    const form = normalizeModel(raw, "image");
    expect(form.warnings.join()).toContain("exotic");
    expect(() =>
      validateParameters(raw, "image", form.mode, {
        prompt: "x",
        count: 1,
        settings: { exotic: 1 },
      }),
    ).toThrow();
    expect(
      validateParameters(raw, "image", form.mode, { prompt: "x", count: 1 })
        .upstreamValidated,
    ).toBe(false);
  });
  it("settings 使用单一 JSON、目录 modelName 与稳定哈希", () => {
    const args = serializeSettings("Z-image Turbo", {
      settings: { quality: "1K", ratio: "1:1" },
    });
    expect(args).toContain("model=Z-image Turbo");
    expect(args).toContain('settings={"quality":"1K","ratio":"1:1"}');
    expect(args.join()).not.toContain("settings.quality");
    expect(schemaHash({ a: 1, b: 2 })).toBe(schemaHash({ b: 2, a: 1 }));
    expect(changedPaths({ a: 1 }, { a: 2 })).toEqual(["/a"]);
  });
});
describe("CLI 1.2.0 兼容性与进程边界", () => {
  it("projectMeta.uuid / nodeKey / newNodeKey 保留关联和边", () => {
    const uuid = "073cb4165ec54d29b24fef3254c05e54";
    expect(
      normalizeCreatedProject({ projectMeta: { uuid, name: "p0" } })
        .projectUuid,
    ).toBe(uuid);
    expect(normalizeCreatedNode({ nodeKey: "i-a" }).nodeKey).toBe("i-a");
    expect(
      normalizeCreatedNode({
        newNodeKey: "i-b",
        connections: [{ id: "e1" }],
        reactFlowNode: { id: "i-b" },
      }).connections,
    ).toHaveLength(1);
  });
  it("服务方法与受控 runner 双重禁止生成和所有写入", async () => {
    let calls = 0;
    const adapter = new LibTVCLIAdapter(async () => {
      calls++;
      return { stdout: "", stderr: "", code: 0, durationMs: 0 };
    });
    await expect(adapter.runNode()).rejects.toMatchObject({
      code: "GENERATION_DISABLED",
    });
    expect(calls).toBe(0);
    const runner = createReadOnlyRunner({
      binary: "must-not-spawn",
      configDir: "does-not-exist",
      workDir: "does-not-exist",
      onResult: async () => {},
    });
    for (const args of [
      ["node", "x", "--run"],
      ["node", "x", "-r"],
      ["project", "create", "x"],
      ["upload", "x"],
      ["account", "use", "1"],
      ["logout"],
      ["node", "list", "-p", "bad"],
      ["project", "list", "--run"],
    ])
      await expect(runner(args)).rejects.toMatchObject({
        code: "CLI_OPERATION_FORBIDDEN",
      });
  });
  it("account info 只输出脱敏 DTO，错误码统一映射", async () => {
    const adapter = new LibTVCLIAdapter(async () => ({
      stdout: JSON.stringify({
        user: { uuid: "private" },
        activeAccount: {
          accountName: "private",
          accountType: 1,
          memberAccount: { effective: false },
        },
        accountsCount: 2,
      }),
      stderr: "",
      code: 0,
      durationMs: 0,
    }));
    expect(JSON.stringify(await adapter.accountInfo())).not.toContain(
      "private",
    );
    const blocked = new LibTVCLIAdapter(async () => ({
      stdout: "",
      stderr: "error 1200000138",
      code: 1,
      durationMs: 0,
    }));
    await expect(blocked.accountInfo()).rejects.toMatchObject({
      code: "LIBTV_GALLERY_CAPACITY_BLOCKED",
    });
  });
  it("拒绝 JSON 畸形和过早的运行进度，支持 NDJSON 查询", async () => {
    const adapter = new LibTVCLIAdapter(async () => ({
      stdout: "[run] task=123",
      stderr: "",
      code: 0,
      durationMs: 0,
    }));
    await expect(
      adapter.canvas("073cb4165ec54d29b24fef3254c05e54"),
    ).rejects.toMatchObject({ code: "CLI_RESPONSE_INVALID" });
    const ndjson = new LibTVCLIAdapter(async () => ({
      stdout: '{"nodeKey":"i-a"}\n{"nodeKey":"i-b"}',
      stderr: "",
      code: 0,
      durationMs: 0,
    }));
    expect(
      await ndjson.getNode("073cb4165ec54d29b24fef3254c05e54", "i-a"),
    ).toHaveLength(2);
  });
  it("日志脱敏不抹掉画布/nodeKey 追溯键", () => {
    const output = redact({
      token: "secret-value",
      ownerUuid: "private",
      nodeKey: "i-safe",
      url: "https://example.com/?token=secret-value",
      message: "Bearer secret-value",
    });
    expect(JSON.stringify(output)).not.toContain("secret-value");
    expect(output.nodeKey).toBe("i-safe");
    expect(
      redact('error payload {"access_token":"private-secret"}'),
    ).not.toContain("private-secret");
  });
});
