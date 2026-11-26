import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const manifest = JSON.parse(await readFile("package.json", "utf8"));
const rows: any[] = [];
for (const [scope, deps] of Object.entries({
  runtime: manifest.dependencies,
  development: manifest.devDependencies,
}))
  for (const name of Object.keys(deps as object)) {
    const pkg = JSON.parse(
      await readFile(
        path.join("node_modules", ...name.split("/"), "package.json"),
        "utf8",
      ),
    );
    rows.push({
      name,
      version: pkg.version,
      license:
        typeof pkg.license === "string"
          ? pkg.license
          : JSON.stringify(pkg.license),
      scope,
      repository:
        typeof pkg.repository === "string"
          ? pkg.repository
          : (pkg.repository?.url ?? null),
    });
  }
const audit = JSON.parse(
  (
    await readFile(".local/framepool-p1/dependency-audit-final.json", "utf8")
  ).replace(/^\uFEFF/, ""),
);
const advisories = Object.values(audit.advisories ?? {}).map((a: any) => ({
  package: a.module_name,
  severity: a.severity,
  url: a.url,
  vulnerableVersions: a.vulnerable_versions,
  patchedVersions: a.patched_versions,
  paths: a.findings.flatMap((f: any) => f.paths),
}));
await writeFile(
  "docs/p1/dependencies.json",
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      source: "Installed package manifests + pnpm lockfile + npm audit",
      packages: rows,
      security: { summary: audit.metadata.vulnerabilities, advisories },
    },
    null,
    2,
  ),
);
await writeFile(
  "docs/p1/dependencies.md",
  "# P1-A 实际依赖与许可证\n\n来源：已安装包的 package.json、pnpm-lock.yaml；完整机器记录见 [dependencies.json](dependencies.json)。\n\n| 包 | 实际版本 | 许可证 | 范围 |\n|---|---|---|---|\n" +
    rows
      .map(
        (r) =>
          `| ${r.name} | ${r.version} | ${r.license ?? "UNKNOWN"} | ${r.scope} |`,
      )
      .join("\n") +
    "\n",
);
console.log(`${rows.length} installed direct dependencies recorded.`);
