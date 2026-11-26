import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../../', import.meta.url));
const installation = JSON.parse((await readFile(path.join(root, 'docs/p0/evidence/installation.json'), 'utf8')).replace(/^\uFEFF/, ''));
const accountKey = process.env.FRAMEPOOL_P0_ACCOUNT ?? 'account-01';
if (!/^account-\d{2}$/.test(accountKey)) throw new Error('Invalid isolated account key.');
const account = path.join(root, '.local/libtv-p0/accounts', accountKey);
const evidence = path.join(root, 'docs/p0/evidence');
const env = { ...process.env, LIBTV_CONFIG_DIR: path.join(account, 'config') };
for (const key of ['LIBTV_TOKEN', 'LIBTV_DEBUG', 'LIBTV_LOGIN_WEB_URL', 'LIBTV_LOGIN_WEB_PATH']) delete env[key];

function sanitize(text) {
  return text.replace(/Bearer\s+[^\s"']+/gi, 'Bearer [REDACTED]')
    .replace(/(\/upload-images\/)[a-f0-9]{32}(\/)/gi, '$1[USER REDACTED]$2')
    .replace(/([?&](?:token|signature|sign|credential|auth)[^=\s]*=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/("(?:[^"\n]*(?:token|cookie|password|secret)|nickname|phone|email|userId|ownerId|ownerUuid|accountId|accountName)"\s*:\s*)("(?:\\.|[^"\\])*"|\d+)/gi, '$1"[REDACTED]"')
    .replace(/\b1[3-9]\d{9}\b/g, '[PHONE REDACTED]');
}

async function capture(name, args) {
  if (accountKey !== 'account-01') name = `${accountKey}-${name}`;
  const startedAt = new Date().toISOString();
  // A durable pre-submit marker prevents replay of a potentially billed operation.
  const mutation = args.includes('--run') || args.includes('create') || args[0] === 'upload';
  const marker = path.join(account, `${name}.submitted.json`);
  if (mutation && !args.includes('--help')) await writeFile(marker, JSON.stringify({ startedAt, args, state: 'submission-unknown' }), { flag: 'wx' });
  const child = spawn(installation.binaryPath, args, { cwd: path.join(account, 'work'), env, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '', timedOut = false;
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const timer = args.includes('--run') ? null : setTimeout(() => { timedOut = true; child.kill(); }, 60_000);
  const exit = await new Promise(resolve => {
    child.once('error', error => resolve({ code: null, error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timer);
  let safeStdout = sanitize(stdout);
  if (args[0] === 'account') safeStdout = safeStdout.replace(/("(?:uuid|id)"\s*:\s*)("[^"\n]*"|\d+)/g, '$1"[REDACTED]"');
  const result = { startedAt, finishedAt: new Date().toISOString(), args, pid: child.pid, ...exit, timedOut, stdout: safeStdout, stderr: sanitize(stderr) };
  await writeFile(path.join(evidence, `${name}.json`), JSON.stringify(result, null, 2) + '\n');
  if (mutation && !args.includes('--help')) await writeFile(marker, JSON.stringify({ ...result, state: exit.code === 0 ? 'cli-exited-successfully' : 'requires-reconciliation' }, null, 2));
  console.log(`${name}: exit=${exit.code}, timeout=${timedOut}`);
  return { ...result, stdout };
}

await mkdir(evidence, { recursive: true });
const mode = process.argv[2] ?? 'help';
if (mode === 'help') {
  const commands = [ ['version', ['--version']], ['help', ['--help']], ['login-web-help', ['login', 'web', '--help']], ['account-info-help', ['account', 'info', '--help']], ['model-help', ['model', '--help']], ['model-search-help', ['model', 'search', '--help']], ['project-create-help', ['project', 'create', '--help']], ['project-use-help', ['project', 'use', '--help']], ['node-help', ['node', '--help']], ['node-create-help', ['node', 'create', '--help']], ['upload-help', ['upload', '--help']], ['download-help', ['download', '--help']] ];
  for (const [name, args] of commands) await capture(name, args);
} else if (mode === 'account') {
  const result = await capture('account-info', ['account', 'info']);
  if (result.code !== 0) process.exitCode = 1;
} else if (mode === 'catalog') {
  const accountInfo = await capture('account-info', ['account', 'info']);
  if (accountInfo.code !== 0) process.exitCode = 1;
  else for (const type of ['image', 'video']) await capture(`models-${type}`, ['model', 'search', '--type', type]);
} else if (mode === 'schema') {
  const key = process.argv[3];
  if (!key || !/^[a-zA-Z0-9_.-]+$/.test(key)) throw new Error('An exact discovered modelKey is required.');
  const result = await capture(`schema-${key}`, ['model', key]);
  if (result.code !== 0) process.exitCode = 1;
} else if (mode === 'schemas') {
  for (const type of ['image', 'video']) {
    const record = JSON.parse(await readFile(path.join(evidence, `models-${type}.json`), 'utf8'));
    if (record.code !== 0) throw new Error(`Cannot read failed ${type} catalog.`);
    const catalog = JSON.parse(record.stdout);
    for (const { modelKey } of catalog.matches) {
      if (!/^[a-zA-Z0-9_.-]+$/.test(modelKey)) throw new Error('Unsafe modelKey.');
      const result = await capture(`schema-${modelKey}`, ['model', modelKey]);
      if (result.code !== 0) process.exitCode = 1;
    }
  }
} else if (mode === 'execute') {
  const name = process.argv[3];
  const args = JSON.parse(process.argv[4] ?? 'null');
  if (!name || !/^[a-zA-Z0-9_.-]+$/.test(name)) throw new Error('Invalid evidence name.');
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string') || !['project', 'node', 'upload', 'download'].includes(args[0])) throw new Error('Expected an explicit canvas CLI argument array.');
  const result = await capture(name, args);
  if (result.code !== 0) process.exitCode = 1;
} else throw new Error('Supported modes: help, account, catalog, schema <modelKey>, execute <name> <JSON args>');
