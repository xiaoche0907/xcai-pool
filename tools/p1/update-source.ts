import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const upstream = "https://github.com/xiaoche0907/xcai-pool.git";
export const upstreamBranch = "refs/heads/main";
export const commitPattern = /^[a-f0-9]{40}$/;
export type UpdateResult = { state: "success" | "failed"; message: string };
export type InstallRequest = { type: "install"; commit: string };

const execute = promisify(execFile);
export async function git(root: string, ...args: string[]) {
  const { stdout } = await execute("git", args, {
    cwd: root,
    timeout: 60_000,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

export async function latestCommit(root: string) {
  const [commit] = (
    await git(root, "ls-remote", "--exit-code", upstream, upstreamBranch)
  ).split(/\s+/);
  if (!commitPattern.test(commit)) throw new Error("GitHub 未返回有效版本。");
  return commit;
}

export async function installBlocker(root: string) {
  if ((await git(root, "branch", "--show-current")) !== "main")
    return "请从 Git 的 main 分支启动此部署。";
  if (await git(root, "status", "--porcelain", "--untracked-files=normal"))
    return "安装目录存在未提交的改动。请提交或备份这些改动后再更新。";
  return null;
}
