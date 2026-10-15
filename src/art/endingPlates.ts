/**
 * 结局插画 · 六张各画一张（设计文档 10.2 / N12 的改版）
 *
 * 原来六个结局共用同一张构图（退潮礁石 + 铜徽），只换一层压色。问题不是"不够好看"，
 * 是**六个结局读起来是同一件事**：玩家走到最坏的「打草惊蛇」和最完美的「潮落」，
 * 这一屏的画面完全一样，只有色相差 20 度。结局插画是这一屏唯一的情绪载体，
 * 它必须自己说清楚"你这次把案子办成了什么样"。
 *
 * 画布是 596×250 的**扁横条**（EndingScene 的 PLATE_TOP=796 / PLATE_BOTTOM=1046）。
 * 高宽比 1:2.4，人眼一次只能抓住一条横向的带子，所以六张统一遵守下面的规矩：
 *
 *   1. **先铺地面/水面**（上亮下暗的横条），再画主体 —— 主体永远有东西可站；
 *   2. **只有一个大件、只有一个最亮点** —— 光斑、门缝、纸面、铜徽各占一处，不抢；
 *   3. 主体**不靠 tint 上色**。tint 是结局色调，越坏的结局越暗（实测断号那屏主体
 *      亮度只有 66），拿它画主体 = 越坏的结局越看不见。tint 只在最后压一层 0.06；
 *   4. 亮部一律用**固定亮色**（EMBLEM_ACCENT / LIGHT_WARM / PAPER_LIT…）。
 *
 * 明度预算（不是随手调的数，是照着"暗场里能不能一眼读出轮廓"定的）：
 * 地皮 20~45，主体 70~110，唯一亮部 150~210。同一张里这三档必须拉开，
 * 否则 250px 高的带子里所有东西会糊成一层灰。
 *
 * 硬约束：Phaser 的 Graphics **不会裁剪到矩形里** —— fillRect/fillTriangle 照画到框外。
 * 本项目踩过一次：礁石倒影的顶点越过插画下沿，一条黑三角从下面按钮中间探出来。
 * 所以本文件里所有几何都写成 (x + w * fx, y + h * fy) 的形式，fx/fy ∈ [0,1]，
 * 顶点在构造上不可能出框。唯一的例外是**光晕**（见 glow 的注释）。
 *
 * 另一个坑：`import type Phaser from 'phaser'` 只取类型，运行时不加载 Phaser。
 * 于是这里的 `poly()` 不能像 placeholders.ts 那样 new Phaser.Math.Vector2()
 * （Graphics.fillPoints 的 d.ts 只收 Vector2[]，收不了 {x,y} 字面量）。
 * 解法是改**三角形扇**填多边形：三角形只有 6 个 number，最不容易出类型岔子。
 */

import type Phaser from 'phaser';
import type { EndingId } from '../data/endings';

type G = Phaser.GameObjects.Graphics;

/** 所有几何都要落在这个矩形里。留 1px 是为了让压边的描边有一点容身之处 */
const EDGE_INSET = 1;

// ── 小工具（placeholders.ts 里的 rect/line/poly/glow/bands 没有导出，这里重写一份）──

function rect(g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(x, y, w, h);
}

function line(g: G, x1: number, y1: number, x2: number, y2: number, color: number, width = 1, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.lineBetween(x1, y1, x2, y2);
}

function circle(g: G, cx: number, cy: number, r: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillCircle(cx, cy, r);
}

function ring(g: G, cx: number, cy: number, r: number, color: number, width = 1, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.strokeCircle(cx, cy, r);
}

/** Graphics 的椭圆以**圆心 + 全宽全高**为准（不是左上角） */
function oval(g: G, cx: number, cy: number, rw: number, rh: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillEllipse(cx, cy, rw * 2, rh * 2);
}

function tri(
  g: G,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: number,
  alpha = 1,
): void {
  g.fillStyle(color, alpha);
  g.fillTriangle(x0, y0, x1, y1, x2, y2);
}

/**
 * 填多边形。
 *
 * 用**扇形三角剖分**而不是 fillPoints：本文件没有 Phaser 的运行时导入，造不出 Vector2。
 * 扇形剖分只对凸多边形成立 —— 凹多边形请先按下标拆成几块凸的再分别调用
 * （残页的纸、打草惊蛇的防雨布都是这么处理的）。顶点少于 3 个直接返回，
 * 免得 fillTriangle 收到退化参数。
 */
function poly(g: G, pts: readonly (readonly [number, number])[], color: number, alpha = 1): void {
  if (pts.length < 3) return;
  const a = pts[0]!;
  for (let i = 1; i < pts.length - 1; i += 1) {
    const b = pts[i]!;
    const c = pts[i + 1]!;
    tri(g, a[0], a[1], b[0], b[1], c[0], c[1], color, alpha);
  }
}

/** 由深到浅的横向色带，用来铺天空 / 海面 / 地面 —— 六张的地皮都用它 */
function bands(g: G, x: number, y: number, w: number, h: number, colors: readonly number[]): void {
  const n = colors.length;
  colors.forEach((c, i) => {
    // 每条的下沿直接取下一段的上沿，最后一条夹到 y+h：整数像素上相邻色带会露出
    // 一条缝，所以终点取"下一段的起点"而不是 y + step + 1；只有最后一条要夹 ——
    // 一旦用 +1 去补缝，整块地皮就会越过插画下沿一格。
    const top = y + (h * i) / n;
    const bottom = i === n - 1 ? y + h : y + (h * (i + 1)) / n;
    rect(g, x, top, w, bottom - top, c);
  });
}

/**
 * 径向光晕。
 *
 * Phaser 的 Graphics 没有渐变填充，同色低透明度的同心圆一圈圈叠就是天然的径向衰减。
 * 从大到小叠（不是从小到大）：圆心在每一圈之内都会被叠到，累计 alpha 最高，
 * 边缘只被最大那圈盖一次 —— "中心最亮"是免费得到的，不用再画实心核。
 *
 * 光晕也不许出框 —— 这条一开始被当成"可以放宽的例外"（理由是最外圈淡到看不见），
 * 自查时量出来才知道错得多离谱：六张里有四张的最外两圈越过上沿 50~130px，
 * 也就是整块插图的上方、卡面标题所在的地方，各压着半透明的暖色/冷色圆盘。
 * 越界的不是一个 alpha 0.012 的圆，是一块 alpha 0.6 的黑三角 —— 同一个道理。
 *
 * 所以圆心和半径都在**构造上**夹进框里：锚点可以写在框边上（"光从上方打下来"
 * 仍然成立），但每一圈的 extent 一定落在 [x, x+w] × [y, y+h] 之内。
 */
function glow(
  g: G,
  x: number,
  y: number,
  w: number,
  h: number,
  fx: number,
  fy: number,
  radius: number,
  color: number,
  strength: number,
  rings = 10,
): void {
  const cx = Math.min(Math.max(x + w * fx, x), x + w);
  const cy = Math.min(Math.max(y + h * fy, y), y + h);
  const rMax = Math.min(radius, cx - x, x + w - cx, cy - y, y + h - cy);
  for (let i = rings; i >= 1; i -= 1) {
    const r = (rMax * i) / rings;
    if (r > 0.5) circle(g, cx, cy, r, color, strength);
  }
}

/**
 * 一条**光柱/光斑**：沿竖直方向堆一组同心椭圆（或同心圆），alpha 中间高、两头低。
 *
 * 不能用 glow 来画光柱：glow 是圆，250px 高的带子里圆会被读成"一盏灯"；
 * 而且 glow 的叠加在圆心附近会顶到 0.2 以上，光柱的"柱"就没形了。
 * 这里用累计 alpha 描出一条亮度曲线，中段最亮，两端自然收进去。
 */
function beam(
  g: G,
  cx: number,
  cy: number,
  rwx: number,
  rwy: number,
  tall: boolean,
  color: number,
  peak: number,
  steps = 9,
): void {
  for (let i = 0; i < steps; i += 1) {
    const t = i / (steps - 1); // 0 = 最外圈，1 = 最里圈
    const a = peak * (0.25 + 0.75 * Math.sin(Math.PI * (0.2 + 0.6 * t)));
    if (tall) oval(g, cx, cy, rwx * (1 - 0.34 * t), rwy * (1 - 0.34 * t), color, a);
    else circle(g, cx, cy, rwx * (1 - 0.34 * t), color, a);
  }
}

/** 虚线圆弧：把一段圆弧切成若干短线。遗失的另外半枚铜徽是唯一的用武之地 */
function dashedArc(
  g: G,
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  dashes: number,
  color: number,
  width: number,
  alpha: number,
): void {
  const step = (a1 - a0) / (dashes * 2 - 1);
  for (let i = 0; i < dashes; i += 1) {
    const s = a0 + step * (i * 2);
    const e = s + step;
    line(g, cx + Math.cos(s) * r, cy + Math.sin(s) * r, cx + Math.cos(e) * r, cy + Math.sin(e) * r, color, width, alpha);
  }
}

// ── 配色 ────────────────────────────────────────────────
//
// 命名按**用途**而不是按色相：六张色调各不相同，但"水、石、纸、金属、光"这些角色
// 的相对明度关系必须一致（主体永远比环境亮两档），否则六张的视觉语法就散了。
//
// 下面这套值是**量出来的**，不是随手挑的。第一版按"暗场里能不能读出轮廓"配，
// 结果自查的亮度图里 tide_ebb 的水面整片落在 18~25、hollow_win 的房间落在 23~32 ——
// 都在 ASCII 的可见阈值以下，等于六百像素宽的半张插图是纯黑。地皮/水面统一抬到
// 36~70 这一档（手机上暗但读得出），主体 100~125，唯一亮部 176~209，三档拉开。
// 抬背景不等于洗白：真正要压暗的地方（EMBLEM_DARK / PLATE_HOLE / DOOR_DARK /
// PAPER_SHADOW）一个都没动，对比是靠"亮部没抬那么多"控制的。

/** 铜徽的固定亮色。不能跟着结局色调走，否则越坏的结局徽越看不见 */
const EMBLEM_ACCENT = 0xc8b48a;

/** 冷光：侧光、门缝、水光都用它，避免每处各挑一个蓝 */
const COOL_LIGHT = 0x9cc4dd;
const EDGE_DARK = 0x04070a;

const TIDE_WATER: readonly number[] = [0x36525f, 0x2d4753, 0x243a45, 0x1c2e37];
const TIDE_ROCK_FAR = 0x445c6b;
const TIDE_ROCK_MAIN = 0x566f80;
const TIDE_ROCK_EDGE = 0x8ba1b0;
const TIDE_GLINT = 0x9a7038;

const DESK: readonly number[] = [0x2b3d4b, 0x2f4250, 0x22313d, 0x1b2731];
const PAPER_LIT = 0xcdc4ad;
const PAPER_SHADE = 0xa89e88;
const PAPER_EDGE = 0xf0e9d6;
const PAPER_SHADOW = 0x080d12;
const PAPER_FOLD = 0x8a8270;
const INK = 0x565248;
const INK_FAINT = 0x807a6a;
const INK_RED = 0x9e4136;

const GROUND_ARCHIVE: readonly number[] = [0x3a4658, 0x323c4c, 0x28303d, 0x20262f];
const STEEL = 0x6d7886;
const STEEL_LIT = 0xb0a795;
const STEEL_EDGE = 0xc2b6a6;
const STEEL_BACK = 0x2a2a30;
const EMBLEM_SHADE = 0x77705f;
const EMBLEM_DARK = 0x0a0c0f;
const LIGHT_WARM = 0xdacaa0;

const GROUND_CASE: readonly number[] = [0x2d4a51, 0x294349, 0x20363c, 0x1a2b30];
const PLATE_LIT = 0x6f7f7b;
const PLATE_EDGE = 0xa9b4aa;
const PLATE_HOLE = 0x171d1e;

const GROUND_ROOM: readonly number[] = [0x3a3a42, 0x323239, 0x28282e, 0x212126];
const SEAT_LIT = 0x9a8155;
const SEAT_TREAD = 0xd8bd8a;
const WOOD = 0x655849;
const WOOD_DARK = 0x483e31;
const DUST_WARM = 0xd8c08a;

const GROUND_WAREHOUSE: readonly number[] = [0x3b3028, 0x332a22, 0x28201a, 0x201a15];
const TARP = 0x6d6458;
const TARP_EDGE = 0x9c8e76;
const TARP_UNDER = 0x332e29;
const TARP_FOLD = 0x4a4238;
const DUST = 0x8a8070;
const DUST_LIT = 0xaaa292;
const WATER_DARK = 0x1e3138;
const DOOR_DARK = 0x090c0d;
const DOOR_LIGHT = 0xc3d6dd;

// ── 共用收口 ────────────────────────────────────────────

/**
 * 每张结尾统一收口：一层很淡的结局色调 + 上下压暗 + 边框。
 *
 * tint 只准出现在这里。0.06 是刻意压得很低的：它只负责让六张的色温不同
 * （暖金 / 冷蓝 / 紫灰 / 青绿 / 浊橄榄 / 锈红），不参与造型 —— 一旦拿它画主体，
 * 「打草惊蛇」那屏就会比「潮落」暗一大截，而这两屏本该只是处境不同。
 */
function finalize(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  rect(g, x, y, w, h, tint, 0.06); // 结局色调，只是一层很淡的压色
  rect(g, x, y, w, 18, EDGE_DARK, 0.7); // 上边压暗
  rect(g, x, y + h - 18, w, 18, EDGE_DARK, 0.7); // 下边压暗
  g.lineStyle(1, 0x2b3a44, 0.9);
  g.strokeRect(x, y, w, h);
}

// ── 1 · 潮落 ────────────────────────────────────────────
/**
 * 延续原来那张构图，但把它从"六个结局共用的背景"升级成"只属于潮落的那个瞬间"。
 *
 * 光从右上角斜切进来：黄昏退潮、水面反光。三块礁石中间那块最高 —— 最高点落在
 * 画面竖直方向的三分之一处；三块要是等高，扁横条里会连成一条锯齿线，读起来像远山
 * 而不是露出水面的礁石。礁石比水面亮两档（水面 ~30，石头 ~55~65），这是"露出来的
 * 石头"和"水"唯一的分界；只靠轮廓线的话，250px 高在这一屏完全看不出前后。
 *
 * 唯一的最亮点是**沉在浅水里的完整铜徽**（EMBLEM_ACCENT，alpha 0.95，亮度 ~180）。
 * 它被画得比礁石大、且压在礁石前面：这是"证据链完整、铜徽到手"的那一屏，徽就得是主角。
 * 礁石倒影限制在 x∈[0.30,0.62]、底边 y+h-4 —— 既避开徽的下沿，也保证顶点不出框
 * （就是这条倒影曾经越界，从按钮中间探出过一条黑三角）。
 */
function paintTideEbb(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left = x + EDGE_INSET;
  const top = y + EDGE_INSET;
  const iw = w - EDGE_INSET * 2;
  const ih = h - EDGE_INSET * 2;
  bands(g, left, top, iw, ih, TIDE_WATER);

  // 右上角斜切进来的黄昏光：整屏唯一的方向性光线。锚点贴着上沿 —— glow 会把
  // 圆心夹住、把半径收到框内，所以"光来自画外"这个意思保留，但一圈都不会溢出去。
  glow(g, x, y, w, h, 0.74, 0, h * 0.35, TIDE_GLINT, 0.024);
  glow(g, x, y, w, h, 0.74, 0, h * 0.2, TIDE_GLINT, 0.028);
  rect(g, left, y + h * 0.2, iw, 2, 0x53707f, 0.5); // 远处水天相接

  // 退潮留下的五道水线：越靠下越暗，暗示水正在退
  for (let i = 0; i < 5; i += 1) {
    const t = i / 4;
    rect(g, left + w * (0.06 + t * 0.05), y + h * (0.44 + t * 0.08), iw * (0.88 - t * 0.16), 1, 0x4a6270, 0.34 - t * 0.22);
  }

  // 三块礁石：中峰刻意偏离正中，免得两腰对称、看着像人工三角
  const base = y + h * 0.84;
  const peaks: readonly (readonly [number, number, number, number])[] = [
    [0.05, 0.5, 0.31, TIDE_ROCK_FAR],
    [0.26, 0.2, 0.66, TIDE_ROCK_MAIN],
    [0.6, 0.44, 0.94, TIDE_ROCK_FAR],
  ];
  for (const p of peaks) {
    // 顶点用 p[2]（峰高）而不是 p[3]（那块石头的颜色）—— 写成 p[3] 会把 4480107 当成
    // 归一化横坐标，x 直接冲到 2.67e9，三角形横穿整个 720 宽的舞台。
    // 顶点审计只查"在不在框里"，这种量级的越界它一眼就能抓到。
    poly(g, [[x + w * p[0], base], [x + w * p[1], y + h * p[2]], [x + w * p[2], base]], p[3]);
  }
  // 左坡受光：光在右上，石头的左坡反而是朝向观者的亮面，右侧压暗
  line(g, x + w * 0.26, y + h * 0.2, x + w * 0.05, base, TIDE_ROCK_EDGE, 2, 0.6);
  line(g, x + w * 0.6, y + h * 0.44, x + w * 0.48, base, TIDE_ROCK_EDGE, 1, 0.4);

  // 礁石倒影：顶点压在 y+h-4 之内，跨度避开铜徽
  poly(g, [[x + w * 0.3, base], [x + w * 0.46, y + h - 4], [x + w * 0.62, base]], 0x0d1a22, 0.6);

  // ── 唯一的最亮点：沉在浅水里的完整铜徽 ──
  // 光圈用固定亮色而不是 tint：tint 越坏的结局越暗，拿它画徽 = 越坏越看不见
  const ecx = x + w * 0.5;
  const ecy = y + h * 0.65;
  const er = h * 0.145;
  circle(g, ecx, ecy, er, 0x0a141b, 0.9); // 暗底，保证亮圈在任何色带上都咬得住
  ring(g, ecx, ecy, er, EMBLEM_ACCENT, 3, 0.95);
  ring(g, ecx, ecy, er * 0.72, EMBLEM_ACCENT, 1, 0.45);
  circle(g, ecx, ecy, er * 0.12, EMBLEM_ACCENT, 1); // 中心的一点高光

  // 徽面上的蛇形折线（父亲旧案的标记）
  const zig: readonly (readonly [number, number])[] = [
    [ecx - er * 0.46, ecy + er * 0.34],
    [ecx - er * 0.12, ecy - er * 0.36],
    [ecx + er * 0.16, ecy + er * 0.3],
    [ecx + er * 0.48, ecy - er * 0.28],
  ];
  for (let i = 0; i < zig.length - 1; i += 1) {
    const a = zig[i]!;
    const b = zig[i + 1]!;
    line(g, a[0], a[1], b[0], b[1], EMBLEM_ACCENT, 2, 1);
  }

  // 两道横过徽面的水光：徽是"沉在水里"而不是"贴在礁石上"，全靠这两笔
  rect(g, ecx - er * 1.1, ecy - er * 0.2, er * 2.2, 1, COOL_LIGHT, 0.3);
  rect(g, ecx - er * 0.95, ecy + er * 0.55, er * 1.9, 1, COOL_LIGHT, 0.2);

  finalize(g, x, y, w, h, tint);
}

// ── 2 · 残页 ────────────────────────────────────────────
/**
 * 一张摊开的卷宗，右下角被撕掉一块。
 *
 * 撕口不能靠"在完整纸面上盖几块暗色"来做 —— 那样撕裂边缘会被暗块自己的直边出卖，
 * 看着像纸被打了马赛克。这里的做法是：纸面按**带锯齿的轮廓**一次填完（扇形剖分，
 * 顶点严格沿逆时针绕行），锯齿右下方那块区域**完全不画**，于是撕口外直接透出桌面的
 * 暗色 —— 纸和桌子共用一条参差的边界，这才是"撕"。
 *
 * 纸面是唯一的最亮点（PAPER_LIT 0xcdc4ad，亮度 ~196）。背景刻意压到 ~40：
 * 桌面一亮的纸就不亮了，纸不亮这道缺口就没人会注意到。
 *
 * 散落的碎屑只放三片，且避开水线所在的横带 —— 纸屑画在水线上会被读成"水里的漂浮物"。
 */
function paintTornPage(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left = x + EDGE_INSET;
  const top = y + EDGE_INSET;
  const iw = w - EDGE_INSET * 2;
  const ih = h - EDGE_INSET * 2;
  bands(g, left, top, iw, ih, DESK);
  glow(g, x, y, w, h, 0.3, 0, h * 0.25, 0x7fa8cc, 0.028); // 左上角灯下的冷光
  rect(g, left, y + h * 0.1, iw, 1, 0x3c5266, 0.5); // 桌沿

  // 纸：逆时针绕一圈，右下角走成参差的撕口。
  // (0.96, 0.86) 是撕口的内角，它决定了"缺掉的那一块"有多大。
  const px = x + w * 0.06;
  const py = y + h * 0.1;
  const x2 = x + w * 0.96;
  const y2 = y + h * 0.9;
  const paper: readonly (readonly [number, number])[] = [
    [px, py],
    [x + w * 0.55, py + 3],
    [x2, py + 5],
    [x2 - 2, y + h * 0.42],
    [x + w * 0.94, y + h * 0.58],
    [x2 - 3, y + h * 0.68],
    [x2 - 2, y2],
    [x + w * 0.86, y + h * 0.84],
    [x + w * 0.79, y + h * 0.88],
    [x + w * 0.74, y + h * 0.8],
    [x + w * 0.66, y + h * 0.87],
    [px + 3, y2 - 2],
    [px, y + h * 0.52],
  ];
  poly(g, paper, PAPER_LIT);

  // 撕口边缘的高光：只有撕口这一段是参差的，写字迹的那几条线因此不敢越界
  const tear: readonly (readonly [number, number])[] = [
    [x2 - 2, y + h * 0.68],
    [x2 - 2, y2],
    [x + w * 0.86, y + h * 0.84],
    [x + w * 0.79, y + h * 0.88],
    [x + w * 0.74, y + h * 0.8],
    [x + w * 0.66, y + h * 0.87],
  ];
  for (let i = 0; i < tear.length - 1; i += 1) {
    const a = tear[i]!;
    const b = tear[i + 1]!;
    line(g, a[0], a[1], b[0], b[1], PAPER_EDGE, 1, 0.85);
  }
  // 下沿的厚度：纸不是零厚度的贴图，压一道暗边才有"摊在桌上"的重量
  rect(g, px, y2 - 2, x2 - px, 3, PAPER_SHADE);

  // 左缘的装订折痕
  rect(g, px + 11, py + 10, 1, y2 - py - 26, PAPER_FOLD, 0.5);
  rect(g, px + 16, py + 10, 1, y2 - py - 26, PAPER_FOLD, 0.28);

  // 字迹：长短不齐的行，末尾被 x2-3 收住，不会越过撕口
  for (let i = 0; i < 6; i += 1) {
    const ty = py + 16 + i * 26;
    rect(g, px + 24, ty, (x2 - 3 - (px + 24)) * (i % 3 === 2 ? 0.64 : 0.92), 2, INK, 0.62 - i * 0.05);
    rect(g, px + 28, ty + 6, (x2 - 3 - (px + 28)) * (i % 2 === 0 ? 0.72 : 0.45), 1, INK_FAINT, 0.3);
  }
  rect(g, x2 - 74, py + 16, 32, 16, INK_RED, 0.5); // 一枚看不清字的红章

  // 撕下来的那一角：三片碎屑，避开水线所在的横带
  poly(g, [[x2 - 12, y + h * 0.72], [x2 - 2, y + h * 0.76], [x2 - 6, y + h * 0.84]], PAPER_SHADE);
  poly(g, [[x + w * 0.78, y + h * 0.94], [x + w * 0.84, y + h * 0.96], [x + w * 0.8, y + h * 0.99]], PAPER_SHADE);
  poly(g, [[x + w * 0.87, y + h * 0.93], [x + w * 0.92, y + h * 0.95], [x + w * 0.89, y + h * 0.98]], PAPER_SHADE);

  finalize(g, x, y, w, h, tint);
}

// ── 3 · 遗徽 ────────────────────────────────────────────
/**
 * 只有左半枚铜徽，右半边是虚线画的空轮廓。
 *
 * 这一屏说的是"东西是真的，但证据链断了一半"，所以真正的主角不是金属，
 * 是**那个不存在的右半边**。做法：右半的内外两层圆弧全部改成断开的虚线，
 * 再沿竖直中线留一道 2px 的暗缝 —— 有了这道缝，左半才会被读成"被切开的一半"，
 * 而不是"画了一半的圆"。
 *
 * 左半的金属盘（STEEL 0x5a636e，亮度 ~97）是这一屏唯一的主体，比背景亮三档；
 * 亮部是外圈 EMBLEM_ACCENT 的上半弧加中心铆钉（STEEL_LIT，亮度 ~148）。
 * 内圈虚线起笔角用 -1.2 而不是 -π/2：内圈半径小，和外圈同角度起笔会让断口
 * 在中线附近对齐成一条缝，看着像画错了。
 */
function paintLostEmblem(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left = x + EDGE_INSET;
  const top = y + EDGE_INSET;
  bands(g, left, top, w - EDGE_INSET * 2, h - EDGE_INSET * 2, GROUND_ARCHIVE);
  glow(g, x, y, w, h, 0.5, 0, h * 0.45, 0x869db4, 0.026); // 头顶的冷光

  const ecx = x + w * 0.5;
  const ecy = y + h * 0.54;
  const er = h * 0.3;

  // 左半：实心的金属盘
  circle(g, ecx, ecy, er, STEEL, 1);
  circle(g, ecx, ecy, er * 0.94, STEEL_LIT, 0.16); // 顶光落在盘面上的那一层
  circle(g, ecx, ecy + er * 0.45, er * 0.86, EMBLEM_DARK, 0.35); // 下半压暗
  ring(g, ecx, ecy, er, EMBLEM_ACCENT, 2, 0.92);
  ring(g, ecx, ecy, er * 0.78, STEEL_EDGE, 1, 0.5);
  // 切面：亮线在左、暗缝在右
  rect(g, ecx - 2, ecy - er, 2, er * 2, STEEL_EDGE, 0.75);
  rect(g, ecx, ecy - er, 2, er * 2, 0x080b0f, 1);

  // 左半的锯齿边：铜徽不是切得整整齐齐的镜片
  for (let i = 0; i < 5; i += 1) {
    const a = Math.PI * (0.55 + i * 0.26);
    const sx = ecx + Math.cos(a) * er;
    const sy = ecy + Math.sin(a) * er;
    tri(g, sx, sy, sx + Math.cos(a) * 7, sy + Math.sin(a) * 7, sx + Math.sin(a) * 4, sy - Math.cos(a) * 4, STEEL, 1);
  }

  // 左半的蛇形折线（和外圈同一个固定亮色）
  const zig: readonly (readonly [number, number])[] = [
    [ecx - er * 0.66, ecy + er * 0.3],
    [ecx - er * 0.34, ecy - er * 0.22],
    [ecx - er * 0.08, ecy + er * 0.26],
  ];
  for (let i = 0; i < zig.length - 1; i += 1) {
    const a = zig[i]!;
    const b = zig[i + 1]!;
    line(g, a[0], a[1], b[0], b[1], EMBLEM_ACCENT, 2, 0.9);
  }

  // 右半：只剩虚线轮廓。两层虚线的半径、起笔角、alpha 都刻意不同
  dashedArc(g, ecx, ecy, er, -Math.PI / 2, Math.PI / 2, 7, EMBLEM_ACCENT, 2, 0.7);
  dashedArc(g, ecx, ecy, er * 0.78, -1.2, 1.2, 5, STEEL_EDGE, 1, 0.3);

  // 缺的那半枚在别处：向右三笔渐弱的刻痕，把"空"指向画面之外
  for (let i = 0; i < 3; i += 1) {
    rect(g, ecx + er * (1.35 + i * 0.5), ecy - er * (0.18 - i * 0.16), er * 0.3, 1, STEEL_EDGE, 0.34 - i * 0.09);
  }

  finalize(g, x, y, w, h, tint);
}

// ── 4 · 断号 ────────────────────────────────────────────
/**
 * 一枚横放的警号牌断成两截，右半比左半低 8px、右移 12px。
 *
 * 这屏要读的是"**错位**"，不是"裂缝"。所以先画两块水泥色的暗影（错开同样的位移量）
 * 当断裂面，再在中缝后面铺一条 9px 宽的暗缝，最后才放两截牌 —— 暗缝比牌面低，
 * 两半之间的空隙是被"透出来的地面"填的，不是被黑色填的，错位量因此看得见。
 * 如果只画一条黑线，两半看着仍然是连着的。
 *
 * 左半的右端故意缺一角（顶点 0.45/0.41）：断面不会像被刀切过。
 *
 * 最亮点是两段受光的上棱（PLATE_EDGE 0xa9b4aa，亮度 ~178），编号方点次之，
 * 左上那颗铆钉第三 —— 三点连起来，玩家才认得出"这是块牌子"。
 */
function paintBrokenNumber(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left0 = x + EDGE_INSET;
  const top0 = y + EDGE_INSET;
  const iw = w - EDGE_INSET * 2;
  const ih = h - EDGE_INSET * 2;
  bands(g, left0, top0, iw, ih, GROUND_CASE);
  beam(g, x + w * 0.5, y + h * 0.76, w * 0.36, h * 0.16, true, 0x7fb8a6, 0.05, 9); // 地面上的一片反光
  rect(g, left0, y + h * 0.52, iw, 1, 0x2d4a4c, 0.55); // 地面缝

  // 两块底影：和牌面同一个错位量，断口才不会看着像浮在空中
  rect(g, x + w * 0.08, y + h * 0.64, w * 0.34, 12, 0x081011, 0.55);
  rect(g, x + w * 0.5, y + h * 0.69, w * 0.36, 12, 0x081011, 0.55);

  // 中缝：断面后面的暗处，两半的错位全靠它才读得出来。
  // 必须是**贴着两半各自断口的那个多边形**，不能图省事用一个矩形 ——
  // 矩形的高度一旦超过牌面（牌面只有 0.42h~0.68h），它就会从牌下面垂出去，
  // 在空中挂出一个纯黑方块，看着像渲染坏了。（v1 就是这么错的：0.5h 起、0.34h 高。）
  poly(
    g,
    [
      [x + w * 0.39, y + h * 0.4],
      [x + w * 0.5, y + h * 0.45],
      [x + w * 0.56, y + h * 0.58],
      [x + w * 0.5, y + h * 0.7],
      [x + w * 0.41, y + h * 0.65],
      [x + w * 0.45, y + h * 0.52],
    ],
    0x050b0c,
    0.95,
  );

  // ── 左半 ──
  // 右端缺一角：这个凹口落在扇形剖分里是安全的（整个多边形的绕向一致）
  poly(
    g,
    [
      [x + w * 0.08, y + h * 0.42],
      [x + w * 0.39, y + h * 0.42],
      [x + w * 0.45, y + h * 0.5],
      [x + w * 0.41, y + h * 0.63],
      [x + w * 0.08, y + h * 0.63],
    ],
    PLATE_LIT,
  );
  rect(g, x + w * 0.08, y + h * 0.42, w * 0.31, 2, PLATE_EDGE, 0.85); // 上棱受光
  rect(g, x + w * 0.08, y + h * 0.61, w * 0.33, 2, 0x1a2222, 0.9); // 下沿压暗
  circle(g, x + w * 0.13, y + h * 0.51, 4, PLATE_HOLE, 1); // 穿绳的孔
  circle(g, x + w * 0.13, y + h * 0.51, 2, PLATE_EDGE, 0.55);
  for (let i = 0; i < 3; i += 1) {
    rect(g, x + w * (0.2 + i * 0.06), y + h * 0.5, 5, 5, PLATE_EDGE, 0.85 - i * 0.15); // 编号方点
  }

  // ── 右半：低 8px、右移 12px ──
  poly(
    g,
    [
      [x + w * 0.5, y + h * 0.472],
      [x + w * 0.88, y + h * 0.472],
      [x + w * 0.88, y + h * 0.68],
      [x + w * 0.5, y + h * 0.68],
      [x + w * 0.56, y + h * 0.6],
    ],
    PLATE_LIT,
  );
  rect(g, x + w * 0.5, y + h * 0.472, w * 0.38, 2, PLATE_EDGE, 0.8);
  rect(g, x + w * 0.5, y + h * 0.66, w * 0.38, 2, 0x1a2222, 0.9);
  circle(g, x + w * 0.84, y + h * 0.56, 4, PLATE_HOLE, 1);
  circle(g, x + w * 0.84, y + h * 0.56, 2, PLATE_EDGE, 0.45);
  for (let i = 0; i < 2; i += 1) {
    rect(g, x + w * (0.62 + i * 0.06), y + h * 0.55, 5, 5, PLATE_EDGE, 0.75 - i * 0.2);
  }

  // 断口的新茬：两道亮边，让"断"有厚度
  line(g, x + w * 0.39, y + h * 0.42, x + w * 0.45, y + h * 0.5, PLATE_EDGE, 1, 0.75);
  line(g, x + w * 0.5, y + h * 0.472, x + w * 0.56, y + h * 0.6, PLATE_EDGE, 1, 0.65);

  // 地面上的两笔位移影，把错位量从牌面延伸到地上
  rect(g, x + w * 0.39, y + h * 0.7, w * 0.06, 2, 0x0a1416, 0.7);
  rect(g, x + w * 0.5, y + h * 0.74, w * 0.07, 2, 0x0a1416, 0.7);

  finalize(g, x, y, w, h, tint);
}

// ── 5 · 无证之胜 ────────────────────────────────────────
/**
 * 一间空的证人席：一张空椅子，头顶一盏孤灯。
 *
 * 这屏的难点是"空"要说出来。空椅子本身不够 —— 得让光**落在没有人坐的地方**：
 * 光锥从顶部一路收到椅面上，椅面上什么都没有，光就一直落到地板、在椅子正下方
 * 摊成一片椭圆光斑。有光斑、没影子，玩家就知道这里本该有个人。
 *
 * 椅子是侧前方视角，四条腿全部画出来（前腿亮、后腿暗）："腿够不够四条"是椅子
 * 能不能被认出来的关键，只画两条腿的椅子在 250px 高的带子里会塌成一张凳子。
 * 唯一的最亮点是灯泡（LIGHT_WARM，亮度 ~203），次亮是椅面的受光上棱（~140）——
 * 灯泡必须比椅子亮一大截，否则"孤灯"就变成了"亮着的家具"。
 *
 * 灯泡落在 y+h*0.12 而不是更靠上：上沿 18px 的压暗带会吃掉灯，灯一暗这屏就没中心了。
 *
 * 顺便记一个踩过的坑：光柱原来是用八圈同心椭圆叠的，但在 alpha 0.016 下叠加出来
 * 只有 ~0.1 的累计不透明度，落在亮度 25 的地面上等于看不见 —— 光柱要的是"柱"，
 * 得靠一条**沿竖直方向的亮度曲线**（beam()）来堆，不能靠同心圆自己叠自己。
 */
function paintHollowWin(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left = x + EDGE_INSET;
  const top = y + EDGE_INSET;
  bands(g, left, top, w - EDGE_INSET * 2, h - EDGE_INSET * 2, GROUND_ROOM);
  glow(g, x, y, w, h, 0.5, 0, h * 0.17, LIGHT_WARM, 0.022, 8);
  rect(g, left, y + h * 0.78, w - EDGE_INSET * 2, 1, 0x3a3a40, 0.45); // 地面与墙的交线

  // 光锥：上宽下窄的一柱光。不画到最下面，剩下的交给椅脚边那片光斑。
  // 每一圈的**上沿**（cy - 半高）都必须 ≥ y 才不出框：第 i 圈上沿 = y + h*(0.13 + 0.37t) - h*(0.078 - 0.033t)
  // 在 t=0 取到最小值 y + h*0.052 —— 这就是 0.13 / 0.078 这两个数为什么不能更小。
  for (let i = 0; i < 9; i += 1) {
    const t = i / 8;
    const a = 0.085 * (0.3 + 0.7 * Math.sin(Math.PI * (0.2 + 0.6 * t)));
    oval(g, x + w * 0.5, y + h * (0.13 + t * 0.37), w * (0.34 - t * 0.22), h * (0.078 - t * 0.033), LIGHT_WARM, a);
  }
  // 椅子正下方的光斑：椭圆本身也是"这里本该有个人"的证据
  oval(g, x + w * 0.5, y + h * 0.8, w * 0.19, h * 0.075, LIGHT_WARM, 0.07);
  oval(g, x + w * 0.5, y + h * 0.8, w * 0.12, h * 0.045, LIGHT_WARM, 0.09);

  // ── 空椅子 ──
  const scx = x + w * 0.5;
  const seatY = y + h * 0.6;
  const seatW = w * 0.15;
  const seatD = h * 0.09;

  // 椅背：两根立柱 + 三根横档 + 一块背板，顶边略收窄
  rect(g, scx - seatW - 3, y + h * 0.3, 7, h * 0.32, WOOD);
  rect(g, scx + seatW - 3, y + h * 0.3, 7, h * 0.32, WOOD);
  rect(g, scx - seatW, y + h * 0.3, seatW * 2, h * 0.07, SEAT_LIT, 1); // 背板
  rect(g, scx - seatW, y + h * 0.3, seatW * 2, 3, SEAT_TREAD, 0.7); // 背板顶棱受光
  for (let i = 0; i < 3; i += 1) {
    rect(g, scx - seatW, y + h * (0.4 + i * 0.06), seatW * 2, 3, WOOD, 1);
  }

  // 椅面：一个梯形（侧前方视角下的进深），前端比后端略宽
  poly(
    g,
    [
      [scx - seatW - 4, seatY],
      [scx + seatW + 4, seatY],
      [scx + seatW + 8, seatY + seatD],
      [scx - seatW - 8, seatY + seatD],
    ],
    SEAT_LIT,
  );
  rect(g, scx - seatW - 4, seatY, seatW * 2 + 8, 3, SEAT_TREAD, 0.6); // 座面前棱

  // 四条腿：后腿先画（暗），前腿后画（亮），前后关系全靠明度差
  line(g, scx - seatW + 3, seatY + seatD - 2, scx - seatW + 1, y + h * 0.78, WOOD_DARK, 3);
  line(g, scx + seatW - 3, seatY + seatD - 2, scx + seatW - 1, y + h * 0.78, WOOD_DARK, 3);
  line(g, scx - seatW - 7, seatY + seatD - 2, scx - seatW - 9, y + h * 0.82, WOOD, 4);
  line(g, scx + seatW + 7, seatY + seatD - 2, scx + seatW + 9, y + h * 0.82, WOOD, 4);

  // 灯泡 + 吊线：灯泡落在光锥最亮的那个中心上
  line(g, x + w * 0.5, y + EDGE_INSET, x + w * 0.5, y + h * 0.075, 0x14161a, 2);
  circle(g, x + w * 0.5, y + h * 0.12, 5, LIGHT_WARM, 1);

  // 光柱里的浮尘：位置由下标算出来，不用随机数（同一帧重绘必须一致）
  for (let i = 0; i < 14; i += 1) {
    const fx = 0.35 + ((i * 37) % 29) / 100;
    const fy = 0.12 + ((i * 53) % 42) / 100;
    rect(g, x + w * fx, y + h * fy, 1, 1, LIGHT_WARM, 0.3);
  }

  finalize(g, x, y, w, h, tint);
}

// ── 6 · 打草惊蛇 ────────────────────────────────────────
/**
 * 一间空仓库：掀开一角的防雨布下面什么都没有，远处一扇半开的门透进一条冷光。
 *
 * 这屏必须**冷**。前五张的"没拿到的东西"分别是缺角、半枚、断号、空座，都还有一件
 * 物证留在画面里；打草惊蛇是唯一一张连物证都没有的 —— 所以这里给的是"人已经走了"
 * 的三个痕迹：被掀开的布、地上那圈灰尘压痕、一扇还开着的门。全屏没有一件暖色的东西。
 *
 * 最亮点是门缝（DOOR_LIGHT，亮度 ~209）：先铺一块近乎全黑的墙（DOOR_DARK，亮度 ~12），
 * 再把冷光摆在它上面，明度差是六张里最大的一处 —— 越坏的结局，唯一的亮点越小、越远、
 * 越不属于你。门里漏到地上的那条光带是次亮（~130），它把"门"和"地"连起来。
 *
 * 防雨布是凹多边形（两个角翘起），不能直接扇形剖分，所以拆成四块凸的：主面
 * （右上的翘角单独一块）+ 背光的下垂褶 + 掀起的背面 + 挽起的布角。布的左缘压在
 * 插画左边线上（fx=0），它是六张里唯一一张主体顶着画框的 —— "掀开"这个动作需要
 * 布**从画面外伸进来**，布自带一条完整的边反而像挂了一块帘子。
 */
function paintTippedOff(g: G, x: number, y: number, w: number, h: number, tint: number): void {
  const left0 = x + EDGE_INSET;
  const top0 = y + EDGE_INSET;
  const iw = w - EDGE_INSET * 2;
  const ih = h - EDGE_INSET * 2;
  bands(g, left0, top0, iw, ih, GROUND_WAREHOUSE);
  rect(g, left0, y + h * 0.6, iw, 1, 0x3d3227, 0.5); // 地面与墙的交线

  // ── 半开的门（唯一的冷光源）──
  rect(g, x + w * 0.76, y + h * 0.08, w * 0.17, h * 0.62, DOOR_DARK); // 门框里的黑
  rect(g, x + w * 0.795, y + h * 0.12, w * 0.032, h * 0.54, DOOR_LIGHT, 1); // 门缝的光
  rect(g, x + w * 0.79, y + h * 0.12, w * 0.012, h * 0.54, DOOR_LIGHT, 0.5); // 光的溢散
  rect(g, x + w * 0.76, y + h * 0.08, w * 0.17, 3, 0x453a2e, 0.9); // 门楣
  // 门扇：半开着，被门缝的光勾出一条边
  poly(
    g,
    [[x + w * 0.83, y + h * 0.09], [x + w * 0.93, y + h * 0.14], [x + w * 0.93, y + h * 0.68], [x + w * 0.83, y + h * 0.66]],
    0x16110e,
  );
  line(g, x + w * 0.83, y + h * 0.09, x + w * 0.83, y + h * 0.66, 0x8a7358, 1, 0.55);
  // 门里漏出来、摊在地上的那道冷光
  poly(
    g,
    [[x + w * 0.78, y + h * 0.63], [x + w * 0.86, y + h * 0.63], [x + w * 0.96, y + h * 0.8], [x + w * 0.8, y + h * 0.8]],
    DOOR_LIGHT,
    0.34,
  );

  // ── 空箱位留下的灰尘压痕 ──
  // 先把这块方框留出来，防雨布再压上去 —— 顺序反了，压痕就会浮在布上
  rect(g, x + w * 0.31, y + h * 0.66, w * 0.3, h * 0.16, 0x352d26, 0.85);
  rect(g, x + w * 0.31, y + h * 0.66, w * 0.3, 2, DUST_LIT, 0.9); // 上沿积的灰最厚
  rect(g, x + w * 0.31, y + h * 0.8, w * 0.3, 2, DUST, 0.65);
  rect(g, x + w * 0.31, y + h * 0.66, 2, h * 0.16, DUST, 0.75);
  rect(g, x + w * 0.59, y + h * 0.66, 2, h * 0.16, DUST, 0.55);
  rect(g, x + w * 0.36, y + h * 0.72, w * 0.2, 2, DUST, 0.5); // 箱底压出来的两道横印
  rect(g, x + w * 0.36, y + h * 0.77, w * 0.2, 1, DUST, 0.4);

  // ── 防雨布：主面（左缘顶到画框，右上角被掀起）──
  poly(
    g,
    [
      [x, y + h * 0.04],
      [x + w * 0.4, y + h * 0.1],
      [x + w * 0.62, y + h * 0.2],
      [x + w * 0.66, y + h * 0.12],
      [x + w * 0.6, y + h * 0.4],
      [x + w * 0.3, y + h * 0.48],
      [x, y + h * 0.42],
    ],
    TARP,
  );
  // 布的左缘压在左边线上，这两笔给它一点厚度，不然像贴纸
  line(g, x, y + h * 0.04, x + w * 0.4, y + h * 0.1, TARP_EDGE, 2, 0.65);
  line(g, x + w * 0.4, y + h * 0.1, x + w * 0.62, y + h * 0.2, TARP_EDGE, 1, 0.5);
  // 下沿被掀起：底下是暗的
  line(g, x + w * 0.6, y + h * 0.4, x + w * 0.3, y + h * 0.48, TARP_UNDER, 2, 0.8);
  line(g, x + w * 0.3, y + h * 0.48, x, y + h * 0.42, TARP_UNDER, 2, 0.8);

  // 下垂的那道褶（凹多边形的另一半，单独一块，绕向保持一致）
  poly(
    g,
    [[x + w * 0.62, y + h * 0.2], [x + w * 0.72, y + h * 0.22], [x + w * 0.68, y + h * 0.46], [x + w * 0.6, y + h * 0.4]],
    TARP_FOLD,
  );

  // 掀起来的那个角：背面朝外，所以比正面更暗
  poly(
    g,
    [[x + w * 0.62, y + h * 0.2], [x + w * 0.66, y + h * 0.12], [x + w * 0.74, y + h * 0.06], [x + w * 0.72, y + h * 0.22]],
    TARP_UNDER,
  );
  line(g, x + w * 0.66, y + h * 0.12, x + w * 0.74, y + h * 0.06, TARP_EDGE, 1, 0.75); // 翘起的那个尖受光

  // 挽布角的绳：从画框上沿垂下来，说明布是被人从上面挂住、又拉开的
  line(g, x + w * 0.7, y + EDGE_INSET, x + w * 0.72, y + h * 0.2, 0x8a7a5e, 1, 0.6);

  // ── 地上一滩水洼 ──
  const puddleY = y + h * 0.88;
  oval(g, x + w * 0.18, puddleY, w * 0.1, h * 0.05, WATER_DARK, 0.8);
  rect(g, x + w * 0.1, puddleY - h * 0.03, w * 0.16, 1, COOL_LIGHT, 0.4); // 反的那条冷光
  rect(g, x + w * 0.12, puddleY, w * 0.11, 1, COOL_LIGHT, 0.26);
  rect(g, x + w * 0.15, puddleY + h * 0.03, w * 0.07, 1, COOL_LIGHT, 0.16);

  finalize(g, x, y, w, h, tint);
}

// ── 入口 ────────────────────────────────────────────────

/**
 * 画一张结局插画。六个结局各画一张，构图由 `ending` 决定；`tint` 只做最后一层压色。
 *
 * switch 穷举六个分支 + default 里做 never 检查：以后往 EndingId 里加第七个结局，
 * 这里会直接编译报错，而不是悄悄退回某一张别人的构图。
 */
export function paintEndingPlate(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ending: EndingId,
  tint: number,
): void {
  switch (ending) {
    case 'tide_ebb':
      paintTideEbb(g, x, y, w, h, tint);
      break;
    case 'torn_page':
      paintTornPage(g, x, y, w, h, tint);
      break;
    case 'lost_emblem':
      paintLostEmblem(g, x, y, w, h, tint);
      break;
    case 'broken_number':
      paintBrokenNumber(g, x, y, w, h, tint);
      break;
    case 'hollow_win':
      paintHollowWin(g, x, y, w, h, tint);
      break;
    case 'tipped_off':
      paintTippedOff(g, x, y, w, h, tint);
      break;
    default: {
      const _never: never = ending;
      throw new Error(`paintEndingPlate: 未处理的结局 ${String(_never)}`);
    }
  }
}
