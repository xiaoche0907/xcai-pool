import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const baseline = JSON.parse(
  (await readFile(".local/framepool-p1/p0-baseline.json", "utf8")).replace(
    /^\uFEFF/,
    "",
  ),
);
const changed: string[] = [];
for (const item of baseline) {
  try {
    if (
      createHash("sha256")
        .update(await readFile(item.path))
        .digest("hex")
        .toUpperCase() !== item.sha256
    )
      changed.push(item.path);
  } catch {
    changed.push(item.path);
  }
}
const result = {
  checkedAt: new Date().toISOString(),
  files: baseline.length,
  unchanged: changed.length === 0,
  changed,
};
await writeFile("docs/p1/preservation.json", JSON.stringify(result, null, 2));
console.log(
  `P0 preservation: ${baseline.length} files, ${changed.length} changed.`,
);
if (changed.length) process.exitCode = 1;
