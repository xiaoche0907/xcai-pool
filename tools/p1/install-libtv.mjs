import "dotenv/config";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  link,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = process.cwd();
const defaultBinary = path.resolve(
  root,
  ".local/libtv-p0/bin/libtv-win-x64/libtv.exe",
);
const binary = process.argv.includes("--default")
  ? defaultBinary
  : path.resolve(root, process.env.LIBTV_BINARY || defaultBinary);

// Windows amd64 asset verified in docs/p0/evidence/installation.json.
const source =
  "https://liblibai-web-static.liblib.cloud/cli/1.2.0/libtv-windows-amd64.zip";
const archiveSize = 22701961;
const archiveHash =
  "01e3bdf36c77d224593eef8fbca822aaa98ad79af0094d81d37f4aabf4b42247";
const binaryHash =
  "11aab860442a7f9f8da66732c20fe5d4fddf85af1e93a047db1c2249b49fa487";

async function matchesHash(file, expected) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex") === expected;
}

async function exists(file) {
  try {
    if (!(await stat(file)).isFile())
      throw new Error("The configured CLI path is not a file.");
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function install() {
  const managed =
    binary === defaultBinary ||
    (process.platform === "win32" &&
      binary.toLowerCase() === defaultBinary.toLowerCase());
  if (!managed) {
    if (!(await exists(binary)))
      throw new Error(
        "LIBTV_BINARY points to a missing file. Correct it or remove the override to use the managed CLI.",
      );
    console.log("LibTV CLI: using the supplied LIBTV_BINARY.");
    return;
  }
  if (await exists(binary)) {
    if (!(await matchesHash(binary, binaryHash)))
      throw new Error(
        "The existing managed CLI does not match the verified binary. It was preserved. Move it aside or configure a different LIBTV_BINARY.",
      );
    console.log("LibTV CLI 1.2.0 already installed.");
    return;
  }
  if (process.platform !== "win32" || process.arch !== "x64")
    throw new Error(
      "Automatic LibTV CLI installation requires Windows x64. Set LIBTV_BINARY to a compatible CLI for this platform.",
    );

  const parent = path.dirname(binary);
  await mkdir(parent, { recursive: true });
  const staging = await mkdtemp(path.join(parent, ".install-"));
  try {
    console.log("Downloading LibTV CLI 1.2.0 for Windows x64...");
    const response = await fetch(source, {
      redirect: "error",
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body)
      throw new Error(`LibTV download failed (HTTP ${response.status}).`);
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > archiveSize)
        throw new Error("LibTV archive exceeds the verified size.");
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    if (
      size !== archiveSize ||
      createHash("sha256").update(content).digest("hex") !== archiveHash
    )
      throw new Error(
        "LibTV archive SHA-256 did not match the verified release.",
      );
    const archive = path.join(staging, "libtv.zip");
    await writeFile(archive, content);
    const entry = "libtv-win-x64/libtv.exe";
    const tar = path.join(
      process.env.SystemRoot || "C:/Windows",
      "System32",
      "tar.exe",
    );
    await exec(tar, ["-xf", archive, entry], {
      cwd: staging,
      windowsHide: true,
      timeout: 30_000,
    });
    const extracted = path.join(staging, entry);
    if (!(await matchesHash(extracted, binaryHash)))
      throw new Error(
        "Extracted LibTV CLI SHA-256 did not match the verified release.",
      );
    const env = { LIBTV_CONFIG_DIR: path.join(staging, "config") };
    for (const name of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP"]) {
      if (process.env[name]) env[name] = process.env[name];
    }
    const { stdout } = await exec(extracted, ["--version"], {
      cwd: staging,
      windowsHide: true,
      timeout: 5000,
      env,
    });
    if (stdout.trim() !== "1.2.0")
      throw new Error("Installed LibTV CLI returned an unexpected version.");
    try {
      await link(extracted, binary);
    } catch (error) {
      if (error.code !== "EEXIST" || !(await matchesHash(binary, binaryHash)))
        throw error;
    }
    console.log("LibTV CLI 1.2.0 installed and verified.");
  } finally {
    const [resolvedStaging, resolvedParent] = await Promise.all([
      realpath(staging),
      realpath(parent),
    ]);
    if (path.dirname(resolvedStaging) === resolvedParent)
      await rm(resolvedStaging, { recursive: true, force: true });
  }
}

try {
  await install();
} catch (error) {
  console.error("LibTV CLI setup failed: " + error.message);
  process.exitCode = 1;
}
