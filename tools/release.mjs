#!/usr/bin/env node
/**
 * npm run release —— 一条命令完成发布。
 *
 *   npm run release                  提交信息自动生成（"发布 2026-10-16 01:30"）
 *   npm run release -- "修了什么"     自定义提交信息
 *   npm run release -- --dry-run     只演一遍流程，不真的提交/推送（也不动索引）
 *
 * 按顺序做四件事：
 *   1. npm run build        构建失败就停，一个字节都不提交
 *   2. git add -A + add -f  dist 在 .gitignore 里，必须 -f 才进得去
 *   3. commit
 *   4. 逐个远端推送          Gitee / GitHub 分别报结果，一个挂了不影响另一个；失败自动重试一次
 *
 * 它**不做**的事：
 *   - 不替你写提交信息（除非你没给，那就用时间戳）
 *   - 推不动 Gitee Pages 的「更新」按钮 —— 那个只能在网页上点，免费版没开放 API
 */

import { execSync, execFileSync } from 'node:child_process';

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// core.quotepath=false：否则 Git 会把含中文的路径写成 "\346\232\227..." 的转义形式。
//
// 必须是 trimEnd 而不是 trim：`git status --porcelain` 的第一行以空格开头
// （" M package.json"），trim 会把那个空格吃掉，调用方按固定 3 字符切 "XY " 前缀时
// 就多切一位，把第一个文件名啃掉一个字母（实测显示成 "ackage.json"）。
const git = (...args) =>
  execFileSync('git', ['-c', 'core.quotepath=false', ...args], { encoding: 'utf8' }).trimEnd();

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
const customMessage = argv.filter((a) => !a.startsWith('--')).join(' ').trim();

// ---------- 0. 必须在仓库根目录 ----------
const root = git('rev-parse', '--show-toplevel');
if (process.cwd().replace(/\\/g, '/').toLowerCase() !== root.replace(/\\/g, '/').toLowerCase()) {
  die(`请在仓库根目录运行：\n     cd "${root}"`);
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
if (branch !== 'main') {
  console.log(C.yellow(`⚠ 当前在 ${branch} 分支 —— 线上跟的是 main，这次推送不会影响生产环境。\n`));
}
if (dryRun) console.log(C.yellow('【--dry-run】只演流程：不提交、不推送、也不动索引\n'));

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
  // 不动索引：普通改动看 status；dist 里"新增但被 ignore"的文件要额外问一次
  const names = new Set();
  for (const l of git('status', '--porcelain', '-uall').split('\n').filter(Boolean)) {
    if (!l.startsWith('!!')) names.add(cleanPath(l));
  }
  for (const l of git('status', '--porcelain', '--ignored=matching', '-uall', '--', 'dist')
    .split('\n')
    .filter(Boolean)) {
    if (l.startsWith('!!')) names.add(cleanPath(l));
  }
  staged = [...names];
} else {
  execFileSync('git', ['add', '-A']);
  execFileSync('git', ['add', '-f', 'dist']);
  staged = git('diff', '--cached', '--name-only').split('\n').filter(Boolean);
}

if (staged.length === 0) {
  console.log(C.green('      没有变化 —— 代码和产物都和上次发布的一样，收工。'));
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

// ---------- 4. 推送 ----------
console.log(C.bold('\n[4/4] 推送'));
const urls = git('remote', 'get-url', '--push', '--all', 'origin').split('\n').filter(Boolean);
if (urls.length === 0) die('origin 没有配置推送地址');

const label = (url) => (/github\.com/.test(url) ? 'GitHub' : /gitee\.com/.test(url) ? 'Gitee' : url);

const results = [];
for (const url of urls) {
  const name = label(url);
  if (dryRun) {
    console.log(`      ${name}  ${C.dim('--dry-run，跳过')}`);
    results.push([name, 'skip']);
    continue;
  }

  let ok = false;
  for (let attempt = 1; attempt <= 2 && !ok; attempt++) {
    if (attempt === 2) console.log(C.yellow(`      ${name} 第一次没成，重试……`));
    try {
      // HTTP/1.1：这台机器上 HTTP/2 推大包更容易中途断
      execFileSync('git', ['-c', 'http.version=HTTP/1.1', 'push', url, 'main'], {
        stdio: 'inherit',
      });
      ok = true;
    } catch {
      /* 两次都失败的话，下面汇总里会报 */
    }
  }
  console.log(ok ? C.green(`      ${name} ✓`) : C.red(`      ${name} ✗`));
  results.push([name, ok ? 'ok' : 'fail']);
}

// ---------- 汇总 ----------
console.log('\n' + C.bold('——— 发布结果 ———'));
for (const [name, state] of results) {
  const mark = state === 'ok' ? C.green('✓') : state === 'skip' ? C.dim('–') : C.red('✗');
  console.log(`  ${mark} ${name}`);
}

const failed = results.filter(([, s]) => s === 'fail').map(([n]) => n);
if (failed.length > 0) {
  console.log(
    '\n' +
      C.yellow(
        `⚠ ${failed.join(' / ')} 没推上去。两边是分开推的，上面打了 ✓ 的那些已经成功了，不用重推。`,
      ),
  );
}

console.log(
  '\n' +
    C.bold('还差一步：') +
    ' Gitee Pages 不会跟着 push 走，去点一次「更新」\n' +
    C.dim('  https://gitee.com/sjcn3/GAME-showdown-reef/pages') +
    '\n' +
    C.dim('  （Vercel 不用管，它跟着 GitHub 自动构建）'),
);

if (failed.length > 0) process.exit(1);
