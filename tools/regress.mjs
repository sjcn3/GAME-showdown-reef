#!/usr/bin/env node
/**
 * 全量回归：把 tools/steps/ 下的验收路线按各自的视口与输入方式跑一遍，
 * 汇总成一张表。任何一条不是全绿，退出码就是 1。
 *
 * 用法（先起好预览服务）：
 *   npx vite preview --port 5199 --strictPort
 *   node tools/regress.mjs                # 桌面视口那一批
 *   node tools/regress.mjs --mobile       # 再加手机视口 + 触摸那一批
 *   node tools/regress.mjs --only p1,p3   # 只跑某几条
 *
 * 报告一律用 Node 读（JSON.parse + utf8）。PowerShell 的
 * `Get-Content -Raw | ConvertFrom-Json` 会按 ANSI 解码 UTF-8，
 * 中文一进来就报"传入的对象无效" —— 看起来像游戏坏了，其实是读法错了。
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_BASE = process.env.SMOKE_URL ?? 'http://localhost:5199';
const OUT_DIR = join(ROOT, 'shots', '_regress');

/** 桌面视口（720×1280，鼠标）—— 每一步都在这个尺寸下先过一遍 */
const DESKTOP = [
  ['p1', 'p1.json'],
  ['p1-hint', 'p1-hint.json'],
  ['p2', 'p2.json'],
  ['p3', 'p3.json'],
  ['p3b', 'p3b.json'],
  ['p3c', 'p3c.json'],
  ['p3d', 'p3d.json'],
  ['p3e', 'p3e.json'],
  ['p4', 'p4.json'],
  ['p4b', 'p4b.json'],
  ['p5-art', 'p5-art.json'],
  ['p5-type', 'p5-type.json'],
  ['audit', 'audit.json'],
  ['c-class', 'c-class.json'],
  ['art-characters', 'art-characters.json'],
  // 坏档不能变成死按钮：往 localStorage 塞六种畸形存档（坏 JSON / 旧版裸快照 /
  // 缺字段的快照 / version 2）再真的重新加载页面，最后验静音跨刷新持久化。
  // 之所以要进矩阵：restore() 是在按钮的 pointerdown 里跑的，"点了没反应、
  // 页面也不白屏"这种失效单测看不见，只有真点下去才知道。
  ['bad-save', '_stress.json'],
];

/**
 * 手机视口 + 触摸那一批。
 *
 * 这一批不是"顺带跑一下"：Scale.FIT 下只有窗口正好 720×1280 时游戏坐标
 * 才等于页面坐标，写死坐标的脚本在桌面上全绿、到手机上会静默点空。
 * 所以每条路线的手机版都是独立的证据。
 */
const MOBILE = [
  ['p1@390x844', 'p1.json', 390, 844],
  // 标题页的铜徽命中区半径 46（图形只有 30）就是为了手机 —— 桌面那批里
  // audit.json 已经点过一次，但那一次证明不了"手指够不够得着"。
  ['title@390x844', 'title.json', 390, 844],
  ['p1-hint@390x844', 'p1-hint.json', 390, 844],
  ['p2@390x844', 'p2.json', 390, 844],
  ['p3@360x780', 'p3.json', 360, 780],
  ['p4@414x896', 'p4.json', 414, 896],
  ['p5-art@412x915', 'p5-art.json', 412, 915],
  ['c-class@390x844', 'c-class.json', 390, 844],
  // 横屏提示只在 `(orientation: landscape) and (max-height: 560px)` 下 display:flex，
  // 所以这条路线**只能在横屏视口跑** —— 放进桌面竖屏那批会 100% 断言失败，
  // 而那失败说明是测试计划的错，不是游戏的错。
  ['c-landscape@844x390', 'c-landscape.json', 844, 390],
];

function parseArgs(argv) {
  const opts = { mobile: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mobile') opts.mobile = true;
    else if (a === '--only') opts.only = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--help' || a === '-h') opts.help = true;
    else throw new Error(`不认识的参数：${a}`);
  }
  return opts;
}

function runOne(name, file, width, height, input) {
  const report = join(OUT_DIR, `${name.replace(/[@.]/g, '_')}.json`);
  const stamp = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const args = [
    join(ROOT, 'tools', 'smoke.mjs'),
    '--url', `${URL_BASE}/?dev=1&t=${stamp}`,
    '--steps-file', join(ROOT, 'tools', 'steps', file),
    '--report', report,
    '--width', String(width),
    '--height', String(height),
    '--input', input,
  ];
  const res = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  try {
    const r = JSON.parse(readFileSync(report, 'utf8'));
    return {
      name,
      steps: r.steps.length,
      failed: r.steps.filter((s) => !s.ok),
      exc: r.exceptions.length,
      cerr: r.consoleErrors.length,
      freq: r.failedRequests.length,
      ok: r.ok,
    };
  } catch (err) {
    return {
      name,
      steps: 0,
      failed: [{ raw: '(没有报告)', error: String(err) }],
      exc: 0,
      cerr: 0,
      freq: 0,
      ok: false,
      tail: (res.stderr ?? '').split('\n').slice(-6).join('\n'),
    };
  }
}

const opts = parseArgs(process.argv.slice(2));
if (opts.help) {
  console.log('用法：node tools/regress.mjs [--mobile] [--only p1,p3]');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

const plan = DESKTOP.map(([name, file]) => [name, file, 720, 1280, 'mouse']);
if (opts.mobile) for (const [name, file, w, h] of MOBILE) plan.push([name, file, w, h, 'touch']);

const picked = opts.only ? plan.filter(([name]) => opts.only.some((o) => name.startsWith(o))) : plan;
if (picked.length === 0) {
  console.error('没有匹配的路线');
  process.exit(1);
}

let totalSteps = 0;
let bad = 0;
for (const [name, file, w, h, input] of picked) {
  const r = runOne(name, file, w, h, input);
  totalSteps += r.steps;
  const clean = r.ok && r.failed.length === 0 && r.exc === 0 && r.cerr === 0 && r.freq === 0;
  if (!clean) bad++;
  console.log(
    `${clean ? 'OK  ' : 'FAIL'} ${name.padEnd(18)} ${String(w).padStart(4)}x${String(h).padEnd(5)} ${input.padEnd(5)} ` +
      `steps=${String(r.steps).padStart(3)} exc=${r.exc} cerr=${r.cerr} freq=${r.freq}`,
  );
  for (const f of r.failed.slice(0, 8)) console.log(`       └ ${f.raw} :: ${f.error ?? ''}`);
  if (r.tail) console.log(r.tail.split('\n').map((l) => `       │ ${l}`).join('\n'));
}

console.log(
  `\n合计 ${picked.length} 条路线 · ${totalSteps} 步 · 失败 ${bad} 条 · ` +
    (bad === 0 ? 'ALL GREEN' : `HAS FAILURES`),
);
process.exit(bad === 0 ? 0 : 1);
