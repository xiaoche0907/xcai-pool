import { spawn } from "node:child_process";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = fileURLToPath(new URL("../../", import.meta.url));
const state = fileURLToPath(
  new URL("../../.local/framepool-p1/magpie-xcaipool-isolated/", import.meta.url),
);
const plugin = fileURLToPath(new URL("./xcaipool", import.meta.url));
const local = parse(readFileSync(new URL("../../.env", import.meta.url)));
const port = Number(local.PORT ?? 4310);
if (
  !Number.isInteger(port) ||
  port < 1 ||
  port > 65535 ||
  !local.VIEWER_API_KEY
) {
  throw new Error("Invalid XcAIPool local port or missing viewer key.");
}
const actions = {
  install: ["plugin", "add", plugin],
  serve: ["serve"],
  list: ["plugin", "list"],
};
const action = process.argv[2];
if (!Object.hasOwn(actions, action))
  throw new Error("Use install, serve or list.");
if (process.platform !== "win32") throw new Error("This isolated launcher has only been configured for Windows.");

const profile = `${state}profile`;
for (const dir of [profile, `${profile}/local`, `${profile}/roaming`]) mkdirSync(dir, { recursive: true });
const configDir = `${state}config/magpie`;
mkdirSync(configDir, { recursive: true });
try {
  writeFileSync(`${configDir}/settings.json`, JSON.stringify({ noWSLAgents: true }), { flag: 'wx' });
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
}

const inherited = [
  "PATH",
  "SystemRoot",
  "WINDIR",
  "TEMP",
  "TMP",
  "COMSPEC",
  "PATHEXT",
  "MAGPIE_BUN",
];
const env = Object.fromEntries(
  inherited
    .filter((key) => process.env[key])
    .map((key) => [key, process.env[key]]),
);
Object.assign(env, {
  USERPROFILE: profile,
  APPDATA: `${profile}/roaming`,
  LOCALAPPDATA: `${profile}/local`,
  DSH_HOME: `${profile}/.dsh`,
  XDG_CONFIG_HOME: `${state}config`,
  XDG_CACHE_HOME: `${state}cache`,
  XDG_DATA_HOME: `${state}data`,
  XDG_STATE_HOME: `${state}state`,
  MAGPIE_ADDR: "127.0.0.1:51668",
  ...(action === "serve" && {
    XCAIPOOL_READ_URL: `http://127.0.0.1:${port}/api/v1`,
    XCAIPOOL_READ_KEY: local.VIEWER_API_KEY,
  }),
});
const child = spawn(
  "magpie.com",
  actions[action],
  { cwd: root, env, stdio: "inherit", shell: false },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("close", (code) => {
  process.exitCode = code ?? 1;
});
