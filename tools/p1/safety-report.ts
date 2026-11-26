import "dotenv/config";
import { writeFile, readFile, readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { openDatabase } from "../../packages/db/src/index.js";
import { auditEvents } from "../../packages/db/src/schema.js";
import { normalizeModel } from "../../packages/model-normalizer/src/index.js";
const { db, client } = openDatabase(process.env.DATABASE_URL!);
try {
  const reads = await db
    .select()
    .from(auditEvents)
    .where(eq(auditEvents.action, "cli.read"));
  const forbidden = reads.filter((r) =>
    (r.redactedMetadata.args ?? []).some((s: string) =>
      [
        "--run",
        "-r",
        "create",
        "upload",
        "use",
        "delete",
        "login",
        "logout",
      ].includes(s),
    ),
  );
  let schemaCount = 0,
    modeCount = 0;
  const unsupported: any[] = [];
  for (const f of await readdir("docs/p0/schemas")) {
    const raw = JSON.parse(
      (await readFile(`docs/p0/schemas/${f}`, "utf8")).replace(/^\uFEFF/, ""),
    );
    schemaCount++;
    for (const mode of normalizeModel(raw, raw.modality).modes) {
      modeCount++;
      const form = normalizeModel(raw, raw.modality, mode);
      if (!form.canValidate)
        unsupported.push({
          modelKey: raw.modelKey,
          mode,
          reason: "媒体类型/whenHas 条件无法确认，明确禁止参数校验通过",
        });
    }
  }
  const productionAudit = JSON.parse(
    (
      await readFile(
        ".local/framepool-p1/dependency-audit-production.json",
        "utf8",
      )
    ).replace(/^\uFEFF/, ""),
  );
  const summary = {
    checkedAt: new Date().toISOString(),
    generationEnabled: process.env.GENERATION_ENABLED === "true",
    cliInvocations: reads.length,
    forbiddenInvocations: forbidden.length,
    readCommandsOnly: forbidden.length === 0,
    schemas: schemaCount,
    modes: modeCount,
    unsupportedModes: unsupported,
    productionDependencyAudit: productionAudit.metadata?.vulnerabilities,
  };
  await writeFile(
    "docs/p1/safety-summary.json",
    JSON.stringify(summary, null, 2),
  );
  if (summary.generationEnabled || forbidden.length)
    throw new Error("P1 safety invariant failed");
  console.log(
    `Safety: ${reads.length} read-only CLI invocations; ${forbidden.length} forbidden; ${schemaCount} schemas / ${modeCount} modes.`,
  );
} finally {
  await client.end();
}
