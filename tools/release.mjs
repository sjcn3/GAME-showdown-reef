#!/usr/bin/env node
/**
 * npm run release —— 一条命令完成发布。
 *
 *   npm run release                  提交信息自动生成（"发布 2026-10-16 01:30"）
 *   npm run release -- "修了什么"     自定义提交信息
 *   npm run release -- --dry-run     只演流程：不构建、不提交、不推送、也不动索引
 *   npm run release -- --push-only   只补推 HEAD，不构建也不提交
 *
 * 按顺序做四件事：
 *   1. npm run build        构建失败就停，一个字节都不提交
 *   2. 收集改动             git add -A（dist/ 不进库，见 .gitignore）
 *   3. commit
 *   4. 逐个远端推送          Gitee / GitHub 分别报结果，一个挂了不影响另一个
 *
 * ── 关于 GitHub 那个坑 ───────────────────────────────────────────────
 * 这台机器 `github.com` 解析到 20.205.243.166（Azure 新加坡），那个 IP 实测
 * 连不上；而美国主站 140.82.11x.3 是通的。所以脚本在推 GitHub 之前会
 * **先扫一遍候选 IP，挑一个 TCP 能连上的再用**，通过 git 的
 * `http.curloptResolve=github.com:443:<ip>` 覆盖解析 —— 不动 hosts、
 * 不要管理员权限、SNI 和证书校验都还是 github.com 本身。
 * 全都扫不到就退回系统 DNS，不会比裸 git push 更糟。
 *
 * 之所以"分别推"而不是一条 `git push origin main`：GitHub 挂掉会让整条命令
 * 返回非零，看起来像"全都没推上去"，其实 Gitee 已经成功了，会误导人重复劳动。
 *
 * 它**不做**的事：
 *   - 不替你写提交信息（除非你没给，那就用时间戳）
 *
 * Gitee 只当异地备份用。Gitee Pages 已于 2024 年前后停止服务（免费版本来也不支持
 * 自定义域名，还要每次手点「更新」），所以这里没有「部署到 Gitee」这一步。
 */

import { execSync, execFileSync } from 'node:child_process';
import net from 'node:net';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// github.com 的候选出口 IP。顺序是"实测能用的排前面，被限速的排后面"。
const GITHUB_IPS = [
  '140.82.112.3',
  '140.82.114.3',
  '140.82.113.3',
  '140.82.121.3',
  '20.27.177.113',
  '20.205.243.166',
];

// core.quotepath=false：否则 Git 会把含中文的路径写成 "\346\232\227..." 的转义形式。
//
// 必须是 trimEnd 而不是 trim：`git status --porcelain` 的第一行以空格开头
// （" M package.json"），trim 会把那个空格吃掉，调用方按固定 3 字符切 "XY " 前缀时
// 就多切一位，把第一个文件名啃掉一个字母（实测显示成 "ackage.json"）。
const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' }).trimEnd();

/** 同步 sleep —— 只有 Atomics.wait 能在不引依赖的前提下阻塞主线程 */
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** 快速 TCP 探活。连不上的 IP 靠 1.5 秒超时筛掉，比让 git 卡 21 秒划算 */
const tcpAlive = (host, port = 443, ms = 1500) =>
  new Promise((resolve) => {
    const sock = net.connect({ host, port });
    const finish = (ok) => {
      sock.destroy();
      resolve(ok);
    };
    sock.setTimeout(ms);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
  });

function die(msg) {
  console.error('\n' + C.red('✗ ') + msg);
  process.exit(1);
}

/** 剥掉 porcelain 的 "XY " 前缀，并把重命名的 "OLD -> NEW" 收敛成 NEW */
const cleanPath = (line) => {
  const p = line.slice(3);
  const arrow = p.indexOf(' -> ');
  return arrow === -1 ? p : p.slice(arrow + 4);
};

// ---------- 参数 ----------
const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const pushOnly = argv.includes('--push-only');
const customMessage = argv
  .filter((a) => !a.startsWith('--'))
  .join(' ')
  .trim();

// ---------- 0. 必须在仓库根目录 ----------
const root = git('rev-parse', '--show-toplevel');
if (process.cwd().replace(/\\/g, '/').toLowerCase() !== root.replace(/\\/g, '/').toLowerCase()) {
  die(`请在仓库根目录运行：\n     cd "${root}"`);
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
  console.log(C.yellow(`⚠ 当前在 ${branch} 分支 —— 线上跟的是 main，这次推送不会影响生产环境。\n`));
}
if (dryRun) console.log(C.yellow('【--dry-run】只演流程：不构建、不提交、不推送、也不动索引\n'));
if (pushOnly) console.log(C.yellow('【--push-only】只补推当前 HEAD，不构建也不提交\n'));

if (!pushOnly) {
  // ---------- 1. 构建 ----------
  console.log(C.bold('[1/4] 构建'));
  if (dryRun) {
    console.log(C.dim('      --dry-run，跳过 npm run build'));
  } else {
    try {
      execSync('npm run build', { stdio: 'inherit' });
    } catch {
      die('构建失败 —— 什么都没提交。先修好构建再发布。');
    }
  }

  // ---------- 2. 收集改动 ----------
  console.log(C.bold('\n[2/4] 收集改动'));
  let staged;
  if (dryRun) {
    // 不动索引。普通 status 就够了：--ignored 不加，忽略项本来就不会列出来
    staged = git('status', '--porcelain', '-uall')
      .split('\n')
      .filter((l) => l && !l.startsWith('!!'))
      .map(cleanPath);
  } else {
    execFileSync('git', ['add', '-A']);
    staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
  }

  if (staged.length === 0) {
    console.log(C.green('      没有变化 —— 代码和产物都和上次发布的一样。'));
    console.log(C.dim('      （只想补推的话：npm run release -- --push-only）'));
    process.exit(0);
  }
  for (const f of staged) console.log('      ' + C.dim(f));

  // 根目录下 _ 开头的临时脚本很容易被 git add -A 顺手带进来
  const suspicious = staged.filter((f) => /^_[^/]*$/.test(f));
  if (suspicious.length > 0) {
    console.log(
      C.yellow(`\n⚠ 这次会带上 ${suspicious.length} 个下划线开头的临时文件：`) +
        '\n      ' +
        suspicious.join('\n      ') +
        '\n' +
        C.dim('  如果那只是临时脚本，按 Ctrl+C 停下，删掉或加进 .gitignore 再跑一次。'),
    );
  }

  // ---------- 3. 提交 ----------
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const message = customMessage || `发布 ${stamp}`;

  console.log(C.bold('\n[3/4] 提交'));
  console.log('      ' + C.dim(message));
  if (dryRun) {
    console.log(C.dim('      --dry-run，跳过'));
  } else {
    execFileSync('git', ['commit', '-m', message], { stdio: 'inherit' });
    console.log('      ' + C.green('已提交 ') + C.dim(git('rev-parse', '--short', 'HEAD')));
  }
}

// ---------- 4. 推送 ----------
console.log(C.bold('\n[4/4] 推送') + C.dim(`  HEAD = ${git('rev-parse', '--short', 'HEAD')}`));
const urls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n').filter(Boolean);
if (urls.length === 0) die('origin 没有配置推送地址');

const label = (url) => (/github\.com/.test(url) ? 'GitHub' : /gitee\.com/.test(url) ? 'Gitee' : url);

/** 推一次。resolveIp 非空时用 http.curloptResolve 覆盖 github.com 的解析 */
function tryPush(url, resolveIp) {
  const args = ['-c', 'http.version=HTTP/1.1'];
  if (resolveIp) args.push('-c', `http.curloptResolve=github.com:443:${resolveIp}`);
  args.push('push', url, 'main');
  execFileSync('git', args, { stdio: 'inherit' });
}

const results = [];
for (const url of urls) {
  const name = label(url);
  if (dryRun) {
    console.log(`      ${name}  ${C.dim('--dry-run，跳过')}`);
    results.push({ name, state: 'skip' });
    continue;
  }

  // GitHub 先扫一遍候选 IP；扫不到就只剩系统 DNS 这一条路
  let candidates = [null];
  if (/github\.com/.test(url)) {
    process.stdout.write(C.dim(`      ${name} 探测出口 IP…… `));
    const alive = [];
    for (const ip of GITHUB_IPS) if (await tcpAlive(ip)) alive.push(ip);
    console.log(alive.length ? C.dim(alive.join(' ')) : C.yellow('一个都不通，改用系统 DNS'));
    candidates = [...alive, null];
  }

  let ok = false;
  let used = null;
  for (const ip of candidates) {
    if (ok) break;
    if (ip) console.log(C.dim(`      走 ${ip}`));
    try {
      tryPush(url, ip);
      ok = true;
      used = ip;
    } catch {
      /* 换下一个候选 */
    }
  }

  if (ok) {
    console.log(C.green(`      ${name} ✓`) + (used ? C.dim(`  (${used})`) : ''));
  } else {
    console.log(C.red(`      ${name} ✗ 试了 ${candidates.length} 个出口`));
  }
  results.push({ name, state: ok ? 'ok' : 'fail', used });
}

// ---------- 汇总 ----------
console.log('\n' + C.bold('——— 发布结果 ———'));
for (const { name, state, used } of results) {
  const mark = state === 'ok' ? C.green('✓') : state === 'skip' ? C.dim('–') : C.red('✗');
  console.log(`  ${mark} ${name}${used ? C.dim('  ' + used) : ''}`);
}

const failed = results.filter((r) => r.state === 'fail').map((r) => r.name);
if (failed.length > 0) {
  console.log(
    '\n' +
      C.yellow(
        `⚠ ${failed.join(' / ')} 没推上去。两边是分开推的，上面打了 ✓ 的那些已经成功了，不用重推。`,
      ) +
      '\n' +
      C.dim('  网络缓过来之后，一条命令补推，不用重新构建：\n') +
      C.dim('     npm run release -- --push-only'),
  );
}

if (failed.length === 0) {
  console.log(
    '\n' +
      C.bold('完成。') +
      ' Vercel 会跟着 GitHub 自己重新构建，一两分钟后生效：\n' +
      C.dim('  https://showdown-reef.top'),
  );
} else {
  process.exit(1);
}
