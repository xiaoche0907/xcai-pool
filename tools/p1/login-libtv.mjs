import "dotenv/config";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const directory = path.resolve(".local/framepool-p1/accounts/account-02");
const config = path.join(directory, "config");
const work = path.join(directory, "work");
const binary = path.resolve(
  process.env.LIBTV_BINARY ?? ".local/libtv-p0/bin/libtv-win-x64/libtv.exe",
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
if (process.platform === "win32") {
  const identity = execFileSync("whoami.exe", { encoding: "utf8" }).trim();
  execFileSync("icacls.exe", [
    directory,
    "/inheritance:r",
    "/grant:r",
    `${identity}:(OI)(CI)F`,
    "*S-1-5-18:(OI)(CI)F",
  ]);
}
for (const folder of [config, work])
  mkdirSync(folder, { recursive: true, mode: 0o700 });
const env = { LIBTV_CONFIG_DIR: config };
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
]) {
  if (process.env[key]) env[key] = process.env[key];
}
const options = { cwd: work, env, shell: false };
if (
  execFileSync(binary, ["--version"], {
    ...options,
    encoding: "utf8",
  }).trim() !== "1.2.0"
) {
  throw new Error("LibTV CLI 1.2.0 is required.");
}
if (existsSync(path.join(config, "credentials.json"))) {
  console.error(
    "This slot already has credentials. Use the dashboard to verify it, or explicitly pass --replace to log in again.",
  );
  if (!process.argv.includes("--replace")) process.exit(1);
}
console.log("请在浏览器隐私窗口打开下方官方链接，用另一个 LibTV 用户登录。");
const child = spawn(binary, ["login", "web"], { ...options, stdio: "inherit" });
child.once("error", () => {
  console.error("无法启动 LibTV CLI。");
  process.exitCode = 1;
});
child.once("close", (code) => {
  process.exitCode = code ?? 1;
});
