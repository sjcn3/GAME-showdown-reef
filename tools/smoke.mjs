/**
 * 浏览器烟测：启动 Edge headless，用 CDP 真点真看，最后吐一份 JSON 报告。
 *
 * 为什么不用 Playwright：本机只装了 Edge，而 Node 24 自带全局 WebSocket，
 * 于是零依赖就能写一个 CDP 客户端 —— 不用为了跑一次冒烟去下几十兆的浏览器二进制。
 *
 * 用法：
 *   node tools/smoke.mjs --url http://localhost:5199/ --out shot.png
 *   node tools/smoke.mjs --url http://localhost:5199/ --step wait:1500 --step click:360,640 --step shot:after.png
 *
 * 步骤多的时候一律写进文件再用 --steps-file —— PowerShell 会把命令行里的双引号吃掉，
 * `eval:__anJiao.goto("x")` 到 node 手里会变成 `goto(x)`：
 *   node tools/smoke.mjs --url "http://localhost:5199/?dev=1" --steps-file tools/steps/p1.json
 *   steps 文件内容是一个 JSON 字符串数组：["wait:2000", "eval:__anJiao.items()", "click:166,945"]
 *
 * 步骤 DSL：
 *   wait:<ms>             等
 *   click:<x>,<y>         按坐标点（--input touch 时改发真实 touchstart/touchend）
 *   click-item:<道具id>   按名字点道具栏格子（坐标问页面要，脚本不写死）
 *   hold-item:<道具id>    同上，但幂等：已经拿在手里就不点（再点一下会取消选中）
 *   click-spot:<热点id>   按名字点场景热点
 *   click-tutorial        点教学浮层的「知道了」（X2；没弹出来就报错）
 *   tutorial-button       点左上角的「?」（X2）
 *   drop-item            点一下空地，把手里的道具放下（成功用过道具后它还在手上）
 *   evidence             点开道具栏左上角的「证据」列表，并确认它真的开了（C1）
 *   evidence-close       关掉证据列表，并确认它真的关了（C1）
 *   reread:<道具id>      在证据列表里点「重读原件」，并确认原件浮层弹了出来（C1）
 *   back                 点右上角返回按钮的第一下 —— 必须是"待确认"才算过（C2）
 *   back-confirm         再点一下，确认已经回到标题页（C2）
 *   click-title:<文字>    按名字点标题页按钮（「开始调查」等）
 *   tap-center           点画布正中（给「点哪都行」的序章用）
 *   click-confront:<id>   按名字点对峙对象（chen / crate / chief）
 *   code:<四位数字>       在密码盘上依次按数字再按「确认」
 *   pad:<按键文字>        在密码盘上按一个键
 *   settle[:上限]         一直点中性空地，直到场景真的安静下来（没有对话/卡片/浮层）
 *   assert:<表达式>       表达式为真才算过
 *   expect:<表达式>       表达式严格 === true 才算过
 *   screen:<场景key>      跳到一个界面（Title / Gallery / Debug 等）
 *   move:<x>,<y>          移动指针（浮层拖动滚动用）
 *   shot:<path>           截图
 *   eval:<表达式>         求值并记进报告
 *
 * 两条铁律：
 *   1) 坐标一律问页面（click-item / click-spot / click-confront / settle 都是），
 *      绝不写死。写死的脚本在布局一变之后就悄悄点在空气上，而报告仍然显示通过。
 *   2) 断言前必须 settle：剧情效果是串行 await 的，`say` 那一句还没播完时
 *      `flag` / `give` 都还没执行，此时去读 `flags()` / `items()` 会看到「什么都没发生」，
 *      于是把好代码误判成 bug。
 *
 * 退出码：有未捕获异常或任一步骤失败 → 1，否则 0；stdout 末尾输出完整 JSON 报告。
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

const argv = process.argv.slice(2);
const opts = {
  url: null,
  out: null,
  steps: [],
  width: 720,
  height: 1280,
  port: 9333,
  timeout: 20000,
  input: 'mouse',
};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--url') opts.url = argv[++i];
  else if (a === '--out') opts.out = argv[++i];
  else if (a === '--step') opts.steps.push(argv[++i]);
  else if (a === '--steps-file') {
    const file = argv[++i];
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('steps 文件必须是 JSON 字符串数组');
    opts.steps.push(...parsed);
  } else if (a === '--report') opts.report = argv[++i];
  else if (a === '--width') opts.width = Number(argv[++i]);
  else if (a === '--height') opts.height = Number(argv[++i]);
  else if (a === '--port') opts.port = Number(argv[++i]);
  else if (a === '--input') opts.input = argv[++i];
}
if (opts.input !== 'mouse' && opts.input !== 'touch') {
  console.error(`--input 只支持 mouse 或 touch，收到：${opts.input}`);
  process.exit(2);
}
if (!opts.url) {
  console.error('缺少 --url');
  process.exit(2);
}
if (opts.out) opts.steps.push(`shot:${opts.out}`);

const edge = EDGE_CANDIDATES.find((p) => existsSync(p));
if (!edge) {
  console.error('找不到 Edge');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 等页面真的走过 n 帧。
 *
 * 鼠标/触摸事件是投递给浏览器主线程的，Phaser 要到下一帧才处理它。只 sleep 不够：
 * 尤其 headless 下 rAF 可能被节流，sleep 结束时会话可能一帧都没画，
 * 紧接着的 eval 读到的是「点击生效前」的状态。所以等的是页面的 rAF 而不是墙钟。
 */
const nextFrames = async (n = 3) => {
  const wait = cdp
    .send('Runtime.evaluate', {
      expression: `new Promise((res)=>{let k=${n};(function tick(){ if(--k<=0) return res(1); requestAnimationFrame(tick); })();})`,
      returnByValue: true,
      awaitPromise: true,
    })
    .catch(() => null);
  await Promise.race([wait, sleep(3000)]);
};

// ---- CDP 客户端 ---------------------------------------------------------
class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = this.pending.get(msg.id);
        if (p) {
          this.pending.delete(msg.id);
          msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
        }
      } else {
        const hs = this.handlers.get(msg.method) || [];
        for (const h of hs) h(msg.params);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP 超时: ${method}`));
        }
      }, 20000);
    });
  }
  on(method, fn) {
    if (!this.handlers.has(method)) this.handlers.set(method, []);
    this.handlers.get(method).push(fn);
  }
}

// ---- 起浏览器 -----------------------------------------------------------
const edgeProc = spawn(
  edge,
  [
    '--headless=new',
    // headless 下窗口被当成「被遮挡的后台标签页」，rAF 会被节流到接近 1Hz，
    // 于是点击派发出去后 Phaser 要等近一秒才处理。把这几条关掉才不会误判成「点击无效」。
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
    `--remote-debugging-port=${opts.port}`,
    `--window-size=${opts.width},${opts.height}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--user-data-dir=' + resolve(process.env.TEMP || '.', `smoke-profile-${opts.port}`),
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let wsUrl = null;
for (let i = 0; i < 60 && !wsUrl; i++) {
  await sleep(250);
  try {
    const res = await fetch(`http://127.0.0.1:${opts.port}/json/version`);
    if (res.ok) wsUrl = (await res.json()).webSocketDebuggerUrl;
  } catch {
    /* 还没起来，继续等 */
  }
}
if (!wsUrl) {
  edgeProc.kill();
  console.error('Edge 启动超时');
  process.exit(2);
}

// 新开一个 page target
const created = await fetch(`http://127.0.0.1:${opts.port}/json/new?about:blank`, { method: 'PUT' }).then((r) =>
  r.json(),
);
const ws = new WebSocket(created.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
const cdp = new CDP(ws);

const consoleLogs = [];
const exceptions = [];
const failedRequests = [];

cdp.on('Runtime.consoleAPICalled', (p) => {
  consoleLogs.push({
    level: p.type,
    text: (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '),
  });
});
cdp.on('Runtime.exceptionThrown', (p) => {
  const d = p.exceptionDetails || {};
  exceptions.push({
    text: d.text,
    desc: d.exception?.description || d.exception?.value || '',
    line: d.lineNumber,
    url: d.url,
  });
});
cdp.on('Log.entryAdded', (p) => {
  const e = p.entry || {};
  if (e.level === 'error') {
    if (e.source === 'network') failedRequests.push(`${e.text} ${e.url || ''}`.trim());
    else consoleLogs.push({ level: 'error', text: `${e.source}: ${e.text}` });
  }
});

await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', {
  width: opts.width,
  height: opts.height,
  deviceScaleFactor: 1,
  mobile: true,
});
if (opts.input === 'touch') {
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
}

await cdp.send('Page.navigate', { url: opts.url });
await sleep(1200); // 等首屏脚本执行

// ---- 执行步骤 -----------------------------------------------------------
const stepReport = [];
for (const raw of opts.steps) {
  const idx = raw.indexOf(':');
  const kind = idx < 0 ? raw : raw.slice(0, idx);
  const arg = idx < 0 ? '' : raw.slice(idx + 1);

  /**
   * 「点哪都行」的画面（序章）用画布正中，不写死坐标。
   * 写死的坐标在别的窗口尺寸下会点在画布外面，而报告仍然是绿的。
   */
  const clickCenter = async () => {
    const r = await cdp.send('Runtime.evaluate', {
      expression: 'JSON.stringify(window.__anJiao && window.__anJiao.center())',
      returnByValue: true,
    });
    const at = r.result?.value ? JSON.parse(r.result.value) : null;
    if (!at) return null;
    await tapAt(at.x, at.y);
    return at;
  };

  const mouseClick = async (x, y) => {
    await cdp.send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      clickCount: 0,
      buttons: 0,
    });
    const base = { x, y, button: 'left', clickCount: 1, buttons: 1 };
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...base });
    await sleep(60);
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...base, buttons: 0 });
    await nextFrames(3);
    await sleep(40);
  };

  // 触摸版的同一件事。--input touch 时整条路线改走它：
  // 鼠标能点通不代表手指能点通，这是「这游戏在手机上真的能玩」唯一诚实的验证方式。
  const touchTap = async (x, y) => {
    const pt = [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt });
    await sleep(60);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await nextFrames(3);
    await sleep(40);
  };
  const tapAt = opts.input === 'touch' ? touchTap : mouseClick;

  try {
    if (kind === 'wait') {
      await sleep(Number(arg) || 500);
      stepReport.push({ step: raw, ok: true });
    } else if (kind === 'click-item' || kind === 'hold-item') {
      // 按道具名点道具栏格子。坐标由页面自己算，脚本不写死 —— 否则
      // 流程里提前拿到某件道具、格子一平移，整条脚本就点错东西。
      // hold-item 是幂等的：已经拿在手里就不点（再点一下会取消选中）。
      const expr = (e) => cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
      const want = JSON.stringify(arg);
      if (kind === 'hold-item') {
        const h = await expr(`window.__anJiao && window.__anJiao.held()`);
        if (h.result?.value === arg) {
          stepReport.push({ step: raw, ok: true, value: 'already held' });
          continue;
        }
      }
      const r = await expr(`JSON.stringify(window.__anJiao && window.__anJiao.itemCell(${want}))`);
      const cell = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!cell) {
        stepReport.push({ step: raw, ok: false, error: `道具栏里没有「${arg}」` });
      } else {
        await tapAt(cell.x, cell.y);
        stepReport.push({ step: raw, ok: true, value: `${arg} @ ${cell.x},${cell.y}` });
      }
    } else if (kind === 'drop-item') {
      /**
       * 点一下空地，把手里的道具放下。
       *
       * 成功使用道具**不会**把它放下（撬棍会一直拿在手里），而"没带 needs 的分支"
       * 又要求空手 —— 于是「用完撬棍后去点一个不需要道具的热点」会静默没反应。
       * 依赖空手的点击之前，先 drop-item。
       */
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.neutral())',
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: '拿不到空地坐标' });
      } else {
        await tapAt(at.x, at.y);
        await sleep(120);
        const h = await cdp.send('Runtime.evaluate', {
          expression: 'String(window.__anJiao && window.__anJiao.held())',
          returnByValue: true,
        });
        stepReport.push({ step: raw, ok: true, value: `held=${h.result?.value}` });
      }
    } else if (kind === 'evidence') {
      /**
       * 点开道具栏左上角的「证据」列表（C1）。
       *
       * 点完必须回头确认列表真的开了 —— 这一步存在的全部意义就是
       * "点得到"，只发一次点击然后记 ok，等于什么都没验证。
       */
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.evidenceButton())',
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: '拿不到「证据」按钮坐标' });
      } else {
        await tapAt(at.x, at.y);
        await sleep(240);
        const rows = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__anJiao && window.__anJiao.evidenceRows())',
          returnByValue: true,
        });
        const open = rows.result?.value ? JSON.parse(rows.result.value) : null;
        if (!open) {
          stepReport.push({ step: raw, ok: false, error: '点了「证据」但列表没打开' });
        } else {
          stepReport.push({ step: raw, ok: true, value: `${Object.keys(open.rows).length} 行 @ ${at.x},${at.y}` });
        }
      }
    } else if (kind === 'evidence-close') {
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.evidenceRows())',
        returnByValue: true,
      });
      const open = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!open) {
        stepReport.push({ step: raw, ok: false, error: '证据列表没开着' });
      } else {
        await tapAt(open.close.x, open.close.y);
        await sleep(200);
        const after = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__anJiao && window.__anJiao.evidenceRows())',
          returnByValue: true,
        });
        const still = after.result?.value ? JSON.parse(after.result.value) : null;
        stepReport.push(
          still ? { step: raw, ok: false, error: '点了关闭但列表还开着' } : { step: raw, ok: true, value: 'closed' },
        );
      }
    } else if (kind === 'reread') {
      /**
       * 在证据列表里点某件道具的「重读原件」（C1）。
       *
       * 同样的道理：只有真的弹出文档浮层才算过。列表里没有原件的行
       * 也排在同一个位置上，点下去什么都不会发生 —— 那种"沉默的成功"
       * 正是这个项目里最难查的一类假绿。
       */
      const want = JSON.stringify(arg);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify((window.__anJiao && window.__anJiao.evidenceRows() || {}).rows[${want}] || null)`,
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: `证据列表里没有「${arg}」` });
      } else {
        await tapAt(at.x, at.y);
        await sleep(400);
        const after = await cdp.send('Runtime.evaluate', {
          expression:
            'JSON.stringify({ doc: !!(window.__anJiao && window.__anJiao.idle() && window.__anJiao.idle().doc), rows: window.__anJiao && window.__anJiao.evidenceRows() })',
          returnByValue: true,
        });
        const s = after.result?.value ? JSON.parse(after.result.value) : null;
        if (!s?.doc) {
          stepReport.push({ step: raw, ok: false, error: `点了「${arg}」但没有弹出原件` });
        } else {
          stepReport.push({ step: raw, ok: true, value: `${arg} 原件已打开` });
        }
      }
    } else if (kind === 'back' || kind === 'back-confirm') {
      // 右上角返回按钮（C2）。两下才走：第一下只 arm，第二下才真回标题页。
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.back())',
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: '当前场景没有返回按钮' });
      } else {
        await tapAt(at.x, at.y);
        await sleep(kind === 'back' ? 180 : 600);
        const after = await cdp.send('Runtime.evaluate', {
          expression: 'JSON.stringify({ back: window.__anJiao && window.__anJiao.back(), active: window.__anJiao && window.__anJiao.active() })',
          returnByValue: true,
        });
        const s = after.result?.value ? JSON.parse(after.result.value) : null;
        if (kind === 'back') {
          stepReport.push(
            s?.back?.armed
              ? { step: raw, ok: true, value: `armed @ ${at.x},${at.y}` }
              : { step: raw, ok: false, error: '点了返回按钮，但没有进入待确认' },
          );
        } else {
          stepReport.push(
            s?.active?.includes('Title')
              ? { step: raw, ok: true, value: 'back to Title' }
              : { step: raw, ok: false, error: `再点一下没回标题页（active=${JSON.stringify(s?.active)}）` },
          );
        }
      }
    } else if (kind === 'click-spot') {
      // 按热点 id 点场景。坐标同样问页面要，避免"点在空气上但报告是绿的"。
      const want = JSON.stringify(arg);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(window.__anJiao && window.__anJiao.hotspot(${want}))`,
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: `当前场景没有热点「${arg}」` });
      } else {
        await tapAt(at.x, at.y);
        stepReport.push({ step: raw, ok: true, value: `${arg} @ ${at.x},${at.y}` });
      }
    } else if (kind === 'click-tutorial') {
      // 教学浮层上的「知道了」（X2）。坐标由浮层自己报 —— 只有开着才有点可点，
      // 所以「点不到」本身就是一条有力的断言：说明它根本没弹出来。
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.tutorial())',
        returnByValue: true,
      });
      const t = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!t) {
        stepReport.push({ step: raw, ok: false, error: '教学浮层没开着' });
      } else {
        await tapAt(t.close.x, t.close.y);
        stepReport.push({ step: raw, ok: true, value: `知道了 @ ${t.close.x},${t.close.y}` });
      }
    } else if (kind === 'tutorial-button') {
      // 左上角「?」（X2）
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.tutorialButton())',
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: '不在探索场景，拿不到左上角「?」' });
      } else {
        await tapAt(at.x, at.y);
        stepReport.push({ step: raw, ok: true, value: `? @ ${at.x},${at.y}` });
      }
    } else if (kind === 'tap-center') {
      const at = await clickCenter();
      if (!at) stepReport.push({ step: raw, ok: false, error: '拿不到画布中心' });
      else stepReport.push({ step: raw, ok: true, value: `center @ ${at.x},${at.y}` });
    } else if (kind === 'click-title') {
      // 标题页按钮（「开始调查」/「结局图鉴」/「判定表 · 调试面板」），坐标由标题页报。
      const want = JSON.stringify(arg);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(window.__anJiao && window.__anJiao.titleButton(${want}))`,
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: `标题页没有按钮「${arg}」` });
      } else {
        await tapAt(at.x, at.y);
        stepReport.push({ step: raw, ok: true, value: `${arg} @ ${at.x},${at.y}` });
      }
    } else if (kind === 'click-confront') {
      // 对峙对象（chen / crate / chief）的坐标由对峙界面自己报。
      const want = JSON.stringify(arg);
      const r = await cdp.send('Runtime.evaluate', {
        expression: `JSON.stringify(window.__anJiao && window.__anJiao.confront() && window.__anJiao.confront().targets[${want}])`,
        returnByValue: true,
      });
      const at = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!at) {
        stepReport.push({ step: raw, ok: false, error: `对峙界面没有对象「${arg}」` });
      } else {
        await tapAt(at.x, at.y);
        stepReport.push({ step: raw, ok: true, value: `${arg} @ ${at.x},${at.y}` });
      }
    } else if (kind === 'pad' || kind === 'code') {
      // code:0808 = 依次按 0/8/0/8 再按「确认」；pad:清空 = 只按一个键。
      // 按键坐标由密码盘自己报，改布局不用动脚本。
      const r = await cdp.send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__anJiao && window.__anJiao.padKeys())',
        returnByValue: true,
      });
      const keys = r.result?.value ? JSON.parse(r.result.value) : null;
      if (!keys) {
        stepReport.push({ step: raw, ok: false, error: '当前没有密码盘' });
      } else {
        const wanted = kind === 'code' ? [...arg, '确认'] : [arg];
        let missed = null;
        for (const label of wanted) {
          const at = keys[label];
          if (!at) {
            missed = label;
            break;
          }
          await tapAt(at.x, at.y);
        }
        stepReport.push(
          missed
            ? { step: raw, ok: false, error: `密码盘上没有按键「${missed}」` }
            : { step: raw, ok: true, value: wanted.join('') },
        );
      }
    } else if (kind === 'settle') {
      // 一直点中性空地，直到场景真的安静下来。
      // 「点 N 下」这种写法一定会过期 —— 加一句台词就全错位了，
      // 所以这里问的是场景状态（idle() / confront() / ending()），不是次数。
      const limit = Number(arg) || 24;
      let clicks = 0;
      let quiet = false;
      let seen = null;
      for (; clicks < limit; clicks++) {
        const r = await cdp.send('Runtime.evaluate', {
          expression:
            'JSON.stringify({ idle: window.__anJiao && window.__anJiao.idle(), at: window.__anJiao && window.__anJiao.neutral(), tu: window.__anJiao && window.__anJiao.tutorial(), cf: window.__anJiao && window.__anJiao.confront(), en: window.__anJiao && window.__anJiao.ending() })',
          returnByValue: true,
        });
        const probe = r.result?.value ? JSON.parse(r.result.value) : null;
        if (probe?.en) {
          // 已经到结局屏了，没有可点的东西
          seen = { scene: 'ending', ...probe.en };
          quiet = true;
          break;
        }
        if (probe?.cf) {
          // 对峙界面：还在等出示道具时就安静了
          seen = {
            scene: 'confront',
            round: probe.cf.round,
            waiting: probe.cf.waiting,
            textBox: probe.cf.textBox,
            fumbleCount: probe.cf.fumbleCount,
          };
          if (!probe.cf.textBox && probe.cf.waiting && !probe.cf.evidence && !probe.cf.doc) {
            quiet = true;
            break;
          }
          await tapAt(probe.cf.neutral.x, probe.cf.neutral.y);
          await sleep(320);
        } else if (probe?.tu) {
          // 玩法教学浮层开着（X2）：按它自己的「知道了」关掉。
          // 不能拿场景上的空地乱点 —— 那块空地正是浮层的背板，
          // 点下去虽然也能关，但脚本就永远说不清"到底是关掉了、还是点空了"。
          await tapAt(probe.tu.close.x, probe.tu.close.y);
          await sleep(320);
        } else if (probe?.idle && probe?.at) {
          seen = probe.idle;
          // 证据列表（C1）与"返回按钮待确认"（C2）都不算 busy，但它们同样在吃点击 ——
          // 漏掉这两项，settle 会对着一个开着的列表继续点，把列表当成场景在推。
          // 教学浮层（X2）同理。
          if (
            !probe.idle.busy &&
            !probe.idle.textBox &&
            !probe.idle.card &&
            !probe.idle.doc &&
            !probe.idle.evidence &&
            !probe.idle.backArmed &&
            !probe.idle.tutorial
          ) {
            quiet = true;
            break;
          }
          await tapAt(probe.at.x, probe.at.y);
          await sleep(320);
        } else {
          // 场景正在切换，等一会儿再看
          await sleep(400);
        }
      }
      stepReport.push({ step: raw, ok: quiet, clicks, value: seen });
    } else if (kind === 'click') {
      const [x, y] = arg.split(',').map(Number);
      await tapAt(x, y);
      stepReport.push({ step: raw, ok: true });
    } else if (kind === 'move') {
      // 触摸模式下必须发真的 touchMove：文档浮层的滚动是按住拖的，
      // 用 tap 代替会变成「点一下就关掉浮层」，测出来的东西完全不是一回事。
      const [x, y] = arg.split(',').map(Number);
      if (opts.input === 'touch') {
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x, y, radiusX: 12, radiusY: 12, force: 1, id: 1 }],
        });
      } else {
        await cdp.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x,
          y,
          button: 'none',
          clickCount: 0,
          buttons: 0,
        });
      }
      await nextFrames(2);
      stepReport.push({ step: raw, ok: true });
    } else if (kind === 'shot') {
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
      const p = resolve(arg);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, Buffer.from(data, 'base64'));
      stepReport.push({ step: raw, ok: true, path: p });
    } else if (kind === 'eval') {
      const r = await cdp.send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
      const ex = r.exceptionDetails;
      stepReport.push({
        step: raw,
        ok: !ex,
        value: r.result?.value,
        error: ex ? ex.exception?.description || ex.text : undefined,
      });
    } else if (kind === 'assert' || kind === 'expect') {
      // assert 只要真值就算过；expect 要求严格 === true。
      // 表达式自己抛异常也算失败，并把异常原文记进报告 ——
      // 否则写错表达式会变成"断言不成立"，让人去查游戏而不是查脚本。
      const r = await cdp.send('Runtime.evaluate', { expression: arg, returnByValue: true, awaitPromise: true });
      const ex = r.exceptionDetails;
      if (ex) {
        stepReport.push({ step: raw, ok: false, error: ex.exception?.description || ex.text });
      } else {
        const v = r.result?.value;
        const truthy = kind === 'assert' ? Boolean(v) : v === true;
        stepReport.push({
          step: raw,
          ok: truthy,
          value: v,
          error: truthy ? undefined : `断言不成立，实际值：${JSON.stringify(v)}`,
        });
      }
    } else if (kind === 'screen') {
      // 从开发钩子直接跳到某个界面（Title / Gallery / Debug 等）。
      const r = await cdp.send('Runtime.evaluate', {
        expression: `window.__anJiao.screen(${JSON.stringify(arg)})`,
        returnByValue: true,
      });
      const ex = r.exceptionDetails;
      stepReport.push({
        step: raw,
        ok: !ex,
        value: r.result?.value,
        error: ex ? ex.exception?.description || ex.text : undefined,
      });
    } else {
      stepReport.push({ step: raw, ok: false, error: '未知步骤' });
    }
  } catch (e) {
    stepReport.push({ step: raw, ok: false, error: String(e?.message || e) });
  }
}

// 收尾前再等一会儿，让延迟抛出的异常有机会被捕获
await sleep(400);

const report = {
  url: opts.url,
  input: opts.input,
  steps: stepReport,
  exceptions,
  consoleErrors: consoleLogs.filter((l) => l.level === 'error' || l.level === 'warning'),
  consoleAll: consoleLogs,
  failedRequests,
  ok: exceptions.length === 0 && stepReport.every((s) => s.ok),
};

ws.close();
edgeProc.kill();
await sleep(300);

// 报告一律用 --report 落盘。PowerShell 的 `>` 重定向会写成 UTF-16LE + BOM，
// 下游 JSON.parse 直接报 "Unexpected token '\uFFFD'"。
if (opts.report) {
  const p = resolve(opts.report);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(report, null, 2), 'utf8');
}

console.log(JSON.stringify(report, null, 2));
process.exit(report.ok ? 0 : 1);
