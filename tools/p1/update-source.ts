import { execFile } from "node:child_process";
import { promisify } from "node:util";

export const upstream = "https://github.com/xiaoche0907/xcai-pool.git";
export const upstreamBranch = "refs/heads/main";
const commitEndpoint =
  "https://api.github.com/repos/xiaoche0907/xcai-pool/commits/main";
export const commitPattern = /^[a-f0-9]{40}$/;
export type UpdateResult = { state: "success" | "failed"; message: string };
export type InstallRequest = { type: "install"; commit: string };

const execute = promisify(execFile);
async function runGit(root: string, args: string[], timeout: number) {
  const { stdout } = await execute("git", args, {
    cwd: root,
    timeout,
    windowsHide: true,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  return stdout.trim();
}

export function git(root: string, ...args: string[]) {
  return runGit(root, args, 60_000);
}

function gitFailure(error: unknown) {
  const issue = error as NodeJS.ErrnoException & {
    killed?: boolean;
    stderr?: string;
  };
  if (issue?.code === "ENOENT")
    return "当前服务找不到 Git，请安装 Git 并检查 PATH。";
  if (issue?.killed) return "Git 连接 GitHub 超时，请检查部署机网络或代理。";
  const stderr = issue?.stderr ?? "";
  if (/certificate|schannel|SSL|TLS/i.test(stderr))
    return "Git 的 TLS 校验或连接失败，请检查系统证书和代理。";
  if (/proxy/i.test(stderr))
    return "Git 无法通过代理连接 GitHub，请检查部署机的 Git 代理配置。";
  if (
    /authentication|repository not found|could not read username/i.test(stderr)
  )
    return "Git 无法访问仓库，请检查部署机的 GitHub 访问权限。";
  return "Git 无法连接 GitHub，请检查部署机网络或代理。";
}

async function remoteGit(root: string, args: string[], timeout: number) {
  try {
    return await runGit(root, args, timeout);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw error;
    return runGit(root, ["-c", "http.version=HTTP/1.1", ...args], timeout);
  }
}

export async function latestCommit(root: string) {
  let reason: string;
  try {
    const [commit, branch] = (
      await remoteGit(
        root,
        ["ls-remote", "--exit-code", upstream, upstreamBranch],
        8000,
      )
    ).split(/\s+/);
    if (!commitPattern.test(commit) || branch !== upstreamBranch)
      throw new Error("Invalid Git ref.");
    return { commit, source: "git" as const, gitIssue: null };
  } catch (error) {
    reason = gitFailure(error);
  }

  let apiIssue = "GitHub API 暂时无法连接。";
  try {
    const response = await fetch(commitEndpoint, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "XcAIPool",
      },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) {
      apiIssue =
        response.status === 403 || response.status === 429
          ? "GitHub API 拒绝访问或达到请求限额。"
          : `GitHub API 返回 HTTP ${response.status}。`;
    } else {
      apiIssue = "GitHub API 未返回有效的提交。";
      const { sha } = (await response.json()) as { sha?: string };
      if (typeof sha === "string" && commitPattern.test(sha))
        return { commit: sha, source: "github-api" as const, gitIssue: reason };
    }
  } catch {
    // Return a safe diagnosis without including URLs from proxy errors or credentials.
  }
  throw new Error(reason + apiIssue);
}

export async function fetchUpdate(root: string) {
  try {
    await remoteGit(
      root,
      ["fetch", "--no-tags", upstream, upstreamBranch],
      60_000,
    );
  } catch (error) {
    throw new Error(gitFailure(error), { cause: error });
  }
}

export async function installBlocker(root: string) {
  if ((await git(root, "branch", "--show-current")) !== "main")
    return "请从 Git 的 main 分支启动此部署。";
  if (await git(root, "status", "--porcelain", "--untracked-files=normal"))
    return "安装目录存在未提交的改动。请提交或备份这些改动后再更新。";
  return null;
}
