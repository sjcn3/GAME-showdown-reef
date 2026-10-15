/**
 * 道具图标（设计文档 10.3 的 11 张）
 *
 * 原来底部道具栏只按 kind 画四种形状（key/clue/tool/extra），于是撬棍和底舱钥匙
 * 长得一模一样、五条线索也长得一模一样 —— 而"我手上拿的到底是哪一件"正是这一栏
 * 唯一要回答的问题。这里给每件道具一张自己的图。
 *
 * 全部用 Graphics 画，不依赖图片资源；与 placeholders.ts 同一套画法。
 *
 * 小图标（约 20px）的可用手段只有两样：**剪影**和**疏密**。
 * 所以 11 个图标在下面三条上互相错开，而不是换着角度画同一个轮廓：
 *   1. 外轮廓 —— 圆 / 缺口圆 / 星形 / 方板 / 长方纸 / 竖本书 / 锯齿残片 /
 *      长条 / 细杆 / 矩形吊牌 / 水滴形；
 *   2. 长宽比与摆放角度 —— 横 / 竖 / 斜各有归属，且是固定不轮换的
 *      （钥匙永远竖着、烟蒂永远 25° 斜着、提货单永远横着）；
 *   3. 内部细节的疏密 —— 证件类给实心块、文书类给细线。
 */

import type Phaser from 'phaser';

import type { ItemId } from '../data/items';

type G = Phaser.GameObjects.Graphics;

/** 标称 24×24 的半个边长 */
const H = 12;
/**
 * 实际用到的半幅。
 *
 * 外圈和四角要留出线宽的余量：lineStyle 沿路径左右各铺半个线宽，
 * 贴着 ±12 画 2px 线，最外侧像素落在 ±13 —— 正好是调用方给的护栏，
 * 再出头就会顶到相邻格子的底板上。
 */
const R = 11;

const sin = (deg: number): number => Math.sin((deg * Math.PI) / 180);
const cos = (deg: number): number => Math.cos((deg * Math.PI) / 180);

/**
 * 一件道具的三档色调。
 *
 * 主轮廓用传入色；点亮一档给受光面和高光，压暗一档给阴影、刻线和"纸背"。
 * 全部从同一个色相推出来而不是写死颜色，是为了让将来按章节换色调时
 * （黄昏橙 / 深夜青 / 雨夜近黑）11 个图标一起走，不会剩下几个没跟上。
 */
interface Ink {
  readonly base: number;
  readonly dim: number;
  readonly bright: number;
  readonly solid: number;
}

/** 按比例缩放 RGB 通道。α 与亮度是两件事：压暗靠缩放通道，不要靠降 alpha。 */
function shade(color: number, k: number): number {
  const r = Math.min(255, Math.round(((color >> 16) & 0xff) * k));
  const g = Math.min(255, Math.round(((color >> 8) & 0xff) * k));
  const b = Math.min(255, Math.round((color & 0xff) * k));
  return (r << 16) | (g << 8) | b;
}

function ink(color: number): Ink {
  return {
    base: color,
    dim: shade(color, 0.62),
    bright: shade(color, 1.3),
    solid: shade(color, 0.34),
  };
}

/** 在当前路径上按标称尺寸折一条折线（不闭口、不填充）。 */
function polyline(g: G, pts: readonly (readonly [number, number])[], s: number, cx: number, cy: number): void {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) g.moveTo(cx + x * s, cy + y * s);
    else g.lineTo(cx + x * s, cy + y * s);
  });
  g.strokePath();
}

/** 同上，但闭口填一块实心。 */
function block(g: G, pts: readonly (readonly [number, number])[], s: number, cx: number, cy: number): void {
  g.beginPath();
  pts.forEach(([x, y], i) => {
    if (i === 0) g.moveTo(cx + x * s, cy + y * s);
    else g.lineTo(cx + x * s, cy + y * s);
  });
  g.closePath();
  g.fillPath();
}

function seg(
  g: G,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  s: number,
  cx: number,
  cy: number,
): void {
  g.lineBetween(cx + x1 * s, cy + y1 * s, cx + x2 * s, cy + y2 * s);
}

// ── 关键道具 ────────────────────────────────────────────

/**
 * 蛇形铜徽：正面圆牌。
 *
 * 铜徽和半块警号牌都归 key，得先在剪影上分开：这枚是**完整**的圆的，
 * 警号牌是缺了一块的。牌面只有一道折线记号 —— 纹样一复杂，
 * 缩到 20px 就糊成一团，只剩"一个圆里面脏了一块"。刻痕压暗一档、
 * 外圈点亮一档，让圆牌看起来是凸的。
 */
function drawBronzeEmblem(g: G, s: number, cx: number, cy: number, k: Ink): void {
  g.lineStyle(1, k.solid, 0.8); // 落影：右下错开 1px，圆牌才不是贴在底板上的
  g.strokeCircle(cx + 1 * s, cy + 1 * s, 10.6 * s);

  g.lineStyle(1, k.dim, 1);
  g.strokeCircle(cx, cy, 8 * s);

  // 蛇形折线：三个拐点，是集团的暗记；只有连续的折才读得出"蛇"，
  // 画成波浪线就和别处的装饰纹分不开了。
  g.lineStyle(2, k.bright, 1);
  polyline(
    g,
    [
      [-4.4, 3.2],
      [-1.4, -3.4],
      [1.6, 3],
      [4.4, -2.8],
    ],
    s,
    cx,
    cy,
  );

  // 下一排短折线当鳞纹：只做疏密，不抢上面那道主标记
  g.lineStyle(1, k.dim, 0.85);
  polyline(
    g,
    [
      [-3.6, 6.4],
      [-1.4, 3.6],
      [0.2, 6.3],
      [2, 3.8],
    ],
    s,
    cx,
    cy,
  );

  g.lineStyle(2, k.base, 1);
  g.strokeCircle(cx, cy, 10.8 * s);
  g.lineStyle(1, k.bright, 0.9); // 左上受光的一段：下缘自然留在 base 色上
  g.beginPath();
  g.arc(cx, cy, 10.8 * s, 200, 300, false);
  g.strokePath();
}

/**
 * 半块警号牌：六角星徽章，右半从正中崩掉。
 *
 * 断口走的是**竖直中线**而不是随便一条斜线 —— 一边齐、一边碎，
 * "半块"是这件道具的核心（残缺的家与案），断口歪着放就只是"一块形状怪的金属"。
 * 断面画成一排锯齿并点亮：新茬是金属最亮的地方。
 */
function drawBadgeHalf(g: G, s: number, cx: number, cy: number, k: Ink): void {
  const star: readonly (readonly [number, number])[] = [
    [0, -10.8],
    [2.6, -5.6],
    [8.6, -4.8],
    [4.2, -0.8],
    [5.6, 4.4],
    [0, 2.4],
  ];
  // 断口：右半缺掉，但边缘不是刀切的，是崩的
  const breakEdge: readonly (readonly [number, number])[] = [
    [0, 2.4],
    [0.7, -1.2],
    [-0.2, -4.2],
    [0.8, -7],
    [0, -10.8],
  ];

  g.lineStyle(1, k.solid, 0.8); // 落影
  polyline(g, [...star, ...breakEdge], s, cx + 1 * s, cy + 1 * s);

  g.fillStyle(k.dim, 0.95);
  block(g, [...star, ...breakEdge], s, cx, cy);

  g.lineStyle(2, k.base, 1);
  polyline(g, [...star, ...breakEdge], s, cx, cy);

  g.lineStyle(1, k.bright, 1); // 崩口的高光
  polyline(g, breakEdge, s, cx, cy);

  // 背面的记号：一只展翅的鸟（信天翁）
  g.lineStyle(1, k.solid, 0.95);
  seg(g, -3.6, -2.2, -1.2, -3.8, s, cx, cy);
  seg(g, -1.2, -3.8, 0, -2.4, s, cx, cy);
  seg(g, -1.2, -3.8, -1.2, -0.6, s, cx, cy);
}

// ── 常规线索 ────────────────────────────────────────────

/**
 * 夹层切割痕迹：钢板一角的特写。
 *
 * 五条线索里唯一一件**不是纸、也不是金属小件**的东西，所以刻意画成"一块板"：
 * 左边是切出来的斜倒角，中间一道整齐的切口，两块板错开半个像素、缝里压黑。
 * 切口是直线、倒角是直线 —— 这就是"专业工具切出来的"和后面名单残页
 * 那道毛边撕口的区别：一件齐、一件毛。
 */
function drawCutMark(g: G, s: number, cx: number, cy: number, k: Ink): void {
  const panel: readonly (readonly [number, number])[] = [
    [-9.6, -8.4],
    [8.6, -8.4],
    [8.6, 8.6],
    [-8.4, 8.6],
  ];
  const bevel: readonly (readonly [number, number])[] = [
    [-11, -9.8],
    [-9.6, -8.4],
    [-8.4, 8.6],
    [-9.8, 9.8],
  ];

  // 缝里透出来的暗：两块板之间是有空隙的
  g.fillStyle(k.solid, 1);
  block(
    g,
    [
      [-11, -9.8],
      [-9.6, -8.4],
      [-8.6, 8.4],
      [-9.8, 9.8],
    ],
    s,
    cx,
    cy,
  );

  g.fillStyle(k.solid, 0.85);
  block(g, panel, s, cx + 0.6 * s, cy + 0.6 * s); // 落影
  // 刻意**不整块填死**：切割痕迹是一道缝，不是一张实心板。
  // 填死的话剪影会和名单残页、提货单几乎重合（都是"一块填满的方形"），
  // 20px 下就分不出是墙板的切口还是纸。
  g.fillStyle(k.dim, 0.28);
  block(g, panel, s, cx, cy);
  g.lineStyle(2, k.base, 1);
  polyline(g, panel, s, cx, cy);

  g.fillStyle(k.dim, 0.75);
  block(g, bevel, s, cx, cy);
  g.lineStyle(1, k.bright, 1); // 倒角受光：切割面是新的
  polyline(g, bevel, s, cx, cy);

  // 板面固定螺栓：两个字，打破"这是一张纸"的可能
  g.lineStyle(1, k.dim, 0.9);
  g.strokeCircle(cx + 5.6 * s, cy - 5 * s, 1.6 * s);
  g.strokeCircle(cx + 5.6 * s, cy + 5.8 * s, 1.6 * s);
  // 左侧两颗：有它们，整个形状才读成"一块铆在壁上的钢板"而不是一张卡片
  g.strokeCircle(cx - 6 * s, cy - 5 * s, 1.6 * s);
  g.strokeCircle(cx - 6 * s, cy + 5.8 * s, 1.6 * s);
}

/**
 * 薄荷烟蒂：斜躺的烟，滤嘴朝右上，烧过的一头朝左下。
 *
 * 画成**斜的**不是构图偏好：直立的细杆会和钥匙的杆撞剪影，
 * 只有斜着躺，20px 下一眼就是"一截烟"。滤嘴用亮色整段涂死、
 * 烟身只保留一粗一细两条边 —— 靠"一端比另一端亮得多"来读方向。
 */
function drawMintCigarette(g: G, s: number, cx: number, cy: number, k: Ink): void {
  const a = 25 * Math.PI / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const t = (d: number): [number, number] => [d * ca, d * sa];

  // 中心线偏移一点，给"烟灰那一端"腾出位置
  const ox = -1;
  const oy = 1.5;
  const la = 8.5;
  const lb = 9;
  const p = (d: number, n: number): [number, number] => {
    const [x, y] = t(d);
    return [ox + x - n * sa, oy + y + n * ca];
  };
  const at = (d: number, n: number, cxx: number, cyy: number): [number, number] => {
    const [x, y] = p(d, n);
    return [cxx + x * s, cyy + y * s];
  };

  g.fillStyle(k.solid, 0.9); // 落影
  block(g, [at(-la, 2.6, 0, 0), at(lb, 2.6, 0, 0), at(lb, -2.6, 0, 0), at(-la, -2.6, 0, 0)], s, cx + 1 * s, cy + 1 * s);

  g.fillStyle(k.base, 0.92); // 烟身
  block(g, [at(-la, 2.2, 0, 0), at(3.4, 2.2, 0, 0), at(3.4, -2.2, 0, 0), at(-la, -2.2, 0, 0)], s, cx, cy);

  g.lineStyle(1, k.dim, 1); // 卷纸接口 + 下缘压暗，白色的东西要靠暗边才不是一块白斑
  seg(g, ...at(-la, 1.2, 0, 0), ...at(3.2, 1.2, 0, 0), s, cx, cy);
  seg(g, ...at(-la, -2.2, 0, 0), ...at(3.4, -2.2, 0, 0), s, cx, cy);

  g.fillStyle(k.bright, 1); // 绿色滤嘴：就是它说明这是码头管理层特供
  block(g, [at(3.4, 2.4, 0, 0), at(lb, 2.4, 0, 0), at(lb, -2.4, 0, 0), at(3.4, -2.4, 0, 0)], s, cx, cy);
  g.lineStyle(1, k.dim, 1); // 滤嘴与烟身之间的接缝
  seg(g, ...p(3.4, 2.4), ...p(3.4, -2.4), s, cx, cy);

  // 烟灰：外圈是烧过的深色，中心留一点暖 —— 否则和一根没点过的烟没区别
  g.fillStyle(k.solid, 1);
  g.fillEllipse(cx + (ox - 9.6 * ca) * s, cy + (oy - 9.6 * sa) * s, 4.4 * s, 4.4 * s);
  g.fillStyle(shade(k.base, 1.45), 0.9);
  g.fillEllipse(cx + (ox - 9.4 * ca) * s, cy + (oy - 9.4 * sa) * s, 2 * s, 2 * s);
}

/**
 * 涂改提货单：横放的提单，中段被后写的字盖住。
 *
 * 关键在**"盖"**：下排的淡字故意露着半个字头，上排的亮字压在它上面，
 * 还多出一条边。只画一排字就是一张普通单据，玩家读不出"这里被改过"。
 * 版式也和航海日志错开：这份是横的、右边折角；那份是竖的、左边装订。
 */
function drawAlteredManifest(g: G, s: number, cx: number, cy: number, k: Ink): void {
  // 这里刻意不画落影：单据是平摊在底板上的纸，不是立着的物件，
  // 而且 shade(color, 0.34) 在 0x111820 的底板上本来也几乎看不见 ——
  // 省下的这 1.5px 边框宁可还给正文。
  g.fillStyle(k.solid, 1); // 右下的折角缺口
  block(g, [[8.6, 4.2], [11.2, 6.6], [8.6, 6.6]], s, cx, cy);

  g.fillStyle(k.dim, 0.42);
  g.fillRect(cx - 11 * s, cy - 7 * s, 22 * s, 15 * s);
  g.lineStyle(2, k.base, 1);
  g.strokeRect(cx - 11 * s, cy - 7 * s, 22 * s, 15 * s);

  g.lineStyle(1, k.bright, 0.55); // 上缘受光
  seg(g, -11, -7, 11, -7, s, cx, cy);

  g.lineStyle(1, k.dim, 0.9); // 表头下的三行小字
  seg(g, -8.6, -3.8, 3.5, -3.8, s, cx, cy);
  seg(g, -8.6, 0.8, 2, 0.8, s, cx, cy);
  seg(g, -8.6, 5.2, 4.5, 5.2, s, cx, cy);

  // 底下的原字："木制工艺品"下压着"象牙雕刻品"的那一层。
  // 刻意低半格、只露上缘 —— 盖掉的部分由下面那条亮条补，
  // 但**必须留一线**：全盖住，"这里被改过"这件事就没了。
  g.lineStyle(1, k.bright, 0.5);
  seg(g, -6.8, 0.4, -4.6, 0.4, s, cx, cy);
  seg(g, -3.2, 0.4, -1, 0.4, s, cx, cy);
  seg(g, 0.4, 0.4, 2.6, 0.4, s, cx, cy);

  // 后写上去的那四个字：整块盖死 + 纵向笔画，才读得出是"盖"不是"并排"
  g.fillStyle(k.bright, 0.95);
  g.fillRoundedRect(cx - 7.2 * s, cy - 2.6 * s, 10 * s, 3 * s, 1 * s);
  g.lineStyle(1, k.base, 1);
  seg(g, -4, -2.2, -4, 0.2, s, cx, cy);
  seg(g, -1.6, -2.2, -1.6, 0.2, s, cx, cy);
  seg(g, 0.8, -2.2, 0.8, 0.2, s, cx, cy);

  // 落款的蛇形暗记：和铜徽同一个记号，把两件证据串起来
  g.lineStyle(1, k.base, 1);
  polyline(
    g,
    [
      [5.4, 5.8],
      [6.8, 3.2],
      [8.2, 5.8],
      [9.6, 3.4],
    ],
    s,
    cx,
    cy,
  );
}

/**
 * 油轮航海日志：竖放的厚本子，左边一道装订条。
 *
 * 和涂改提货单同样是一叠纸，靠三样东西分开：竖版、左侧装订、末页手写。
 * 最后一行画成**手写条**（一条压暗的实心块，不是细线），下面只剩一页 ——
 * "最后一页是手写补入的"是这条线索的全部内容，画成印刷细线就没了。
 */
function drawShipLog(g: G, s: number, cx: number, cy: number, k: Ink): void {
  // 与提货单同理：纸不画落影，省下的边框还给内容
  g.fillStyle(k.solid, 1); // 右下页角的折痕
  block(g, [[8, 6.8], [10, 9], [8, 9]], s, cx, cy);

  g.fillStyle(k.dim, 0.42);
  g.fillRect(cx - 8.2 * s, cy - 10 * s, 15 * s, 19 * s);
  g.lineStyle(2, k.base, 1);
  g.strokeRect(cx - 8.2 * s, cy - 10 * s, 15 * s, 19 * s);

  // 左侧装订条：压暗一档 + 三道缝线，本子和单页的差别全在这条上
  g.fillStyle(k.solid, 0.55);
  g.fillRect(cx - 8.2 * s, cy - 10 * s, 3.4 * s, 19 * s);
  g.lineStyle(1, k.base, 1);
  seg(g, -4.8, -10, -4.8, 9, s, cx, cy);
  g.lineStyle(1, k.dim, 0.9);
  seg(g, -7.2, -7.4, -6.2, -6.2, s, cx, cy);
  seg(g, -7.2, -1.4, -6.2, -0.2, s, cx, cy);
  seg(g, -7.2, 4.6, -6.2, 5.8, s, cx, cy);

  // 印刷的横格
  g.lineStyle(1, k.dim, 0.85);
  seg(g, -3.2, -6.8, 5.2, -6.8, s, cx, cy);
  seg(g, -3.2, -3.2, 5.2, -3.2, s, cx, cy);
  seg(g, -3.2, 0.4, 3.8, 0.4, s, cx, cy);

  // 手写补入的最后一行
  g.fillStyle(k.bright, 0.92);
  g.fillRoundedRect(cx - 3.2 * s, cy + 3.2 * s, 7.2 * s, 2.6 * s, 1 * s);
  g.lineStyle(1, k.dim, 1);
  seg(g, -3.2, 2.4, 5.2, 2.4, s, cx, cy);

  // 页脚一个极小的锚：点名"锚地以东 7 海里"，也压住页面下半的空白
  g.lineStyle(1, k.dim, 0.95);
  g.strokeCircle(cx - 0.4 * s, cy + 7.4 * s, 1.6 * s);
  seg(g, -0.4, 5.8, -0.4, 9, s, cx, cy);
  seg(g, -1.9, 7.8, 1.1, 7.8, s, cx, cy);
}

/**
 * 保护伞名单残页：右上角被撕掉的一块纸。
 *
 * 撕口刻意做成**不等深的锯齿**：和夹层切割痕迹的那道齐口摆在一起，
 * "一件被切、一件被撕"必须一眼分得开。最后一行被撕口截断 ——
 * 原句是"撕口正好截在这一行之后"，留半个字比留一整行更说明问题。
 */
function drawListFragment(g: G, s: number, cx: number, cy: number, k: Ink): void {
  const shape: readonly (readonly [number, number])[] = [
    [-7, -9.4],
    [9.6, -9.4],
    [7.2, -6],
    [10.2, -2.4],
    [7.4, 1.4],
    [9.8, 5.4],
    [6.8, 6.2],
    [7.8, 9.4],
    [-7, 9.4],
  ];

  g.fillStyle(k.solid, 0.85); // 落影
  block(g, shape, s, cx + 0.8 * s, cy + 0.8 * s);

  g.fillStyle(k.dim, 0.42);
  block(g, shape, s, cx, cy);
  g.lineStyle(1, k.bright, 0.85);
  polyline(g, shape, s, cx, cy);

  g.lineStyle(1, k.dim, 0.95); // 纸背露出的纤维
  polyline(
    g,
    [
      [8.2, -7.6],
      [9.2, -4.3],
      [8.4, 0],
      [8.8, 3.6],
      [7.4, 7.6],
    ],
    s,
    cx,
    cy,
  );

  // 三行字，逐行变短，最后一行被撕口截掉
  g.lineStyle(1, k.base, 0.95);
  seg(g, -5.6, -5.4, 7.6, -5.4, s, cx, cy);
  seg(g, -5.6, -1.8, 8.2, -1.8, s, cx, cy);
  seg(g, -5.6, 1.8, 6.8, 1.8, s, cx, cy);
  seg(g, -5.6, 5.4, 6.2, 5.4, s, cx, cy);
}

// ── 工具 ───────────────────────────────────────────────

/**
 * 撬棍：一根斜的钢 bar，尾端缠胶带。
 *
 * 撬棍和底舱钥匙同属 tool，是最容易画成同一根棍的一对。区别给在两头：
 * 撬棍一头是**扁铲**、另一头是**弯钩**，杆本身粗；钥匙两头是**圆环 + 齿**，杆细。
 * 杆身横跨整格、斜 45° 且不做任何旋转变化 —— 钥匙永远是竖的。
 */
function drawCrowbar(g: G, s: number, cx: number, cy: number, k: Ink): void {
  // 落影线宽收细一档：5px 的笔画在端点处再各铺 2.5px，
  // 45° 上就会顶穿 13 的护栏；这里用细一条的暗影换回一点余量。
  g.lineStyle(3, k.solid, 0.9); // 落影
  seg(g, -10.4, 9.4, 5.6, -5.8, s, cx + 1 * s, cy + 1 * s);

  g.lineStyle(4, k.base, 1); // 杆
  seg(g, -10.4, 9.4, 5.6, -5.8, s, cx, cy);

  g.lineStyle(1, k.bright, 0.75); // 杆的受光边
  seg(g, -10.2, 8.2, 5.2, -6.2, s, cx, cy);
  g.lineStyle(1, k.solid, 0.9); // 背光边：细长物件全靠这两条边撑出圆柱感
  seg(g, -10, 10.2, 6, -5, s, cx, cy);

  // 扁铲：杆末端横向张开的一块扁头。撬棍这头是**扁**的、另一头是勾的 ——
  // 一头扁一头勾，才不会被读成"一根有弯的棍"。
  // 铲头刻意做短：它沿杆轴只伸 2，主要靠横向张开 6 来表态，
  // 因为 45° 上沿轴多伸一点就会顶穿 13 的护栏。
  g.fillStyle(k.base, 1);
  block(g, [[-9.6, 9.8], [-12.4, 8.2], [-11.2, 6.4], [-8.4, 8]], s, cx, cy);
  g.lineStyle(1, k.bright, 1); // 铲口的亮边：这是撬的时候真正吃力的地方
  seg(g, -12.4, 8.2, -9.6, 9.8, s, cx, cy);

  g.lineStyle(3, k.bright, 0.9); // 弯钩
  polyline(
    g,
    [
      [5, -6.6],
      [7.6, -9.2],
      [10, -8],
    ],
    s,
    cx,
    cy,
  );
  g.lineStyle(2, k.dim, 1); // 钩尖回勾
  seg(g, 10, -8, 10.8, -6.4, s, cx, cy);

  // 柄上褪色的胶带
  g.lineStyle(3, k.dim, 0.95);
  seg(g, -9, 9.4, -8.4, 7.4, s, cx, cy);
  seg(g, -6.6, 7, -6, 5, s, cx, cy);
}

/**
 * 底舱钥匙：竖着的挂锁钥匙，环在上、齿在下。
 *
 * 和撬棍的斜杆反着来：**竖直**摆放，读者看到的是一个"上圆下齿"的剪影。
 * 齿上给一小段亮色 —— 描述里写"锁孔是干净的，最近常开"，
 * 磨损处正是这把钥匙和别的钥匙不同的地方。
 */
function drawHoldKey(g: G, s: number, cx: number, cy: number, k: Ink): void {
  // 环：外面一圈实心环，再压一个实心的孔 —— 孔是"空"的，必须比底板还暗
  g.fillStyle(k.base, 1);
  g.fillCircle(cx, cy - 6.8 * s, 4.2 * s);
  g.fillStyle(k.solid, 1);
  g.fillCircle(cx, cy - 6.8 * s, 2.1 * s);
  g.lineStyle(1, k.bright, 0.9); // 环的左上受光
  g.beginPath();
  g.arc(cx, cy - 6.8 * s, 4.2 * s, 190, 285, false);
  g.strokePath();

  g.lineStyle(3, k.base, 1); // 杆
  seg(g, 0, -3.6, 0, 7.4, s, cx, cy);
  g.lineStyle(1, k.bright, 0.7);
  seg(g, -0.6, -3.6, -0.6, 6.8, s, cx, cy);

  g.fillStyle(k.base, 1); // 齿：朝右，长短不一，锁齿的形状本身就是"钥匙"两个字
  g.fillRect(cx, cy + 6.0 * s, 5 * s, 2 * s);
  g.fillRect(cx, cy + 9.4 * s, 3.4 * s, 2 * s);
  g.fillRect(cx, cy + 2.6 * s, 3.6 * s, 2 * s);
  g.lineStyle(1, k.bright, 1); // 常开的那道口磨亮了
  seg(g, 0, 2.6, 3.6, 2.6, s, cx, cy);
}

// ── 附属物证 ────────────────────────────────────────────

/**
 * 海关封条：横放的封条，已经剪断的铅封线垂在左下。
 *
 * 五条线索加两件 key 之后，画面上的"长方形"已经太多了（提货单、日志、残页），
 * 所以给封条配两个别人没有的东西：一个是左端固定线的**铅封孔**，
 * 另一个是从孔里垂下来的一截断线 —— 剪断的线是这个剪影唯一的开口。
 * 背后那圈虚影是"胶痕重新压过"：比封条本身大一圈、错开一点。
 */
function drawCustomsSeal(g: G, s: number, cx: number, cy: number, k: Ink): void {
  // 重新压过的胶痕：比封条大一圈、还偏了一点。
  // 方框只做 21 宽：它是四方里唯一横着的，再宽一档，转 6° 后最远的那个角
  // 就会顶出 13 的护栏 —— "大一圈"读得出来就够了，不必真的大很多。
  const a = 0.105;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const ghost = (x0: number, y0: number, w: number, h: number): void => {
    const box: readonly (readonly [number, number])[] = [
      [x0, y0],
      [x0 + w, y0],
      [x0 + w, y0 + h],
      [x0, y0 + h],
    ];
    polyline(
      g,
      box.map(([x, y]): [number, number] => [x * ca - y * sa - 1, x * sa + y * ca]),
      s,
      cx,
      cy,
    );
  };
  g.lineStyle(1, k.bright, 0.26);
  ghost(-9.7, -4.2, 21, 10);
  g.lineStyle(1, k.bright, 0.16);
  ghost(-9.2, -6.4, 21, 10);

  g.lineStyle(2, k.dim, 0.9); // 垂下来的断线
  polyline(
    g,
    [
      [-6.5, 3.8],
      [-7.6, 6.6],
      [-5.9, 9.4],
      [-7.2, 10.9],
    ],
    s,
    cx,
    cy,
  );
  g.fillStyle(k.base, 1);
  g.fillCircle(cx - 6.5 * s, cy + 3.6 * s, 1.7 * s);

  g.fillStyle(k.solid, 0.85); // 落影
  g.fillRoundedRect(cx - 9.2 * s, cy - 4.6 * s, 19 * s, 10 * s, 2 * s);

  g.fillStyle(k.dim, 0.48);
  g.fillRoundedRect(cx - 10 * s, cy - 5.4 * s, 19 * s, 10 * s, 2 * s);
  g.lineStyle(2, k.base, 1);
  g.strokeRoundedRect(cx - 10 * s, cy - 5.4 * s, 19 * s, 10 * s, 2 * s);

  g.lineStyle(1, k.dim, 1); // 封条上的两行字
  seg(g, -5.4, -1.2, 6.2, -1.2, s, cx, cy);
  seg(g, -5.4, 1.8, 2.4, 1.8, s, cx, cy);

  g.lineStyle(1, k.bright, 0.9); // 重新压过的那道折痕：横贯整条，压住上面的字
  seg(g, -9.2, -3.6, 9, -3.6, s, cx, cy);

  // 两端的金属压边 + 铆钉：封条是"金属条"不是"纸条"。
  // 少了这两个翼，它在 20px 下就只是一块横长方形，和提货单撞脸。
  g.fillStyle(k.base, 1);
  g.fillRect(cx - 12 * s, cy - 6.6 * s, 2.6 * s, 12 * s);
  g.fillRect(cx + 9.4 * s, cy - 6.6 * s, 2.6 * s, 12 * s);
  g.lineStyle(1, k.bright, 1);
  seg(g, -12, -6.6, -9.4, -6.6, s, cx, cy);
  seg(g, 9.4, -6.6, 12, -6.6, s, cx, cy);
  g.fillStyle(k.solid, 0.95);
  g.fillCircle(cx - 10.7 * s, cy, 1.3 * s);
  g.fillCircle(cx + 10.7 * s, cy, 1.3 * s);
}

/**
 * 象牙样本：一截带尖的牙料，断面朝左下。
 *
 * 断面是全图唯一一块**实心亮面**，因为"断面很新"就是这条描述的全部：
 * 哪怕缩到 14px，那点亮也还在。牙身画成上宽下窄的斜四边形，
 * 尾端收成一个尖 —— 直的柱体就成了铅笔。
 */
function drawIvorySample(g: G, s: number, cx: number, cy: number, k: Ink): void {
  const body: readonly (readonly [number, number])[] = [
    [-3.4, -7.6],
    [3, -5.2],
    [7, 5.6],
    [2.8, 8.6],
  ];

  g.fillStyle(k.solid, 0.85); // 落影
  block(g, body, s, cx + 0.8 * s, cy + 0.8 * s);

  g.fillStyle(k.dim, 0.55);
  block(g, body, s, cx, cy);
  g.lineStyle(2, k.base, 1);
  polyline(g, body, s, cx, cy);

  g.lineStyle(1, k.bright, 0.9); // 牙脊：一道就够了，多画就成了别的东西
  seg(g, -2.6, -6, 3, 3, s, cx, cy);

  g.fillStyle(k.solid, 0.9); // 牙体与断面之间的暗影，把断面的"新"顶出来
  block(g, [[-3.4, -7.6], [3, -5.2], [2.6, -5.4], [-4.6, -5.4]], s, cx, cy);

  // 断面：外层年轮 + 内层高光（椭圆高度卡在 11.4，再高就从上沿溢出）
  g.fillStyle(k.base, 1);
  g.fillEllipse(cx - 3 * s, cy - 6.8 * s, 10 * s, 11.4 * s);
  g.lineStyle(1, k.solid, 1);
  g.strokeEllipse(cx - 3 * s, cy - 6.8 * s, 6.4 * s, 8 * s);
  g.fillStyle(k.bright, 1);
  g.fillEllipse(cx - 3.4 * s, cy - 7.6 * s, 5.6 * s, 6.6 * s);

  g.lineStyle(1, k.solid, 0.9); // 锯口边缘的碎屑
  seg(g, -2.8, 5, -1.2, 5.4, s, cx, cy);
  seg(g, 3.4, 8.2, 4.6, 7.6, s, cx, cy);
}

// ── 入口 ───────────────────────────────────────────────

/**
 * 把一件道具画进以 (cx, cy) 为中心的 24×24 标称框里。
 *
 * `g` 进来时状态未知（可能是刚 clear 过的，也可能还留着别人的 lineStyle），
 * 所以每个分支都自己设样式；本函数不读也不依赖 g 的任何当前状态。
 * 坐标一律在"以中心为原点、半幅 12"的空间里写，最后统一乘 scale，
 * 换尺寸时不需要动任何一条路径。
 */
export function drawItemIcon(
  g: Phaser.GameObjects.Graphics,
  id: ItemId,
  cx: number,
  cy: number,
  color: number,
  scale = 1,
): void {
  const k = ink(color);
  const s = scale * (H / 12); // 归一化到标称半幅

  switch (id) {
    case 'bronze_emblem':
      drawBronzeEmblem(g, s, cx, cy, k);
      break;
    case 'badge_half':
      drawBadgeHalf(g, s, cx, cy, k);
      break;
    case 'cut_mark':
      drawCutMark(g, s, cx, cy, k);
      break;
    case 'mint_cigarette':
      drawMintCigarette(g, s, cx, cy, k);
      break;
    case 'altered_manifest':
      drawAlteredManifest(g, s, cx, cy, k);
      break;
    case 'ship_log':
      drawShipLog(g, s, cx, cy, k);
      break;
    case 'list_fragment':
      drawListFragment(g, s, cx, cy, k);
      break;
    case 'crowbar':
      drawCrowbar(g, s, cx, cy, k);
      break;
    case 'hold_key':
      drawHoldKey(g, s, cx, cy, k);
      break;
    case 'customs_seal':
      drawCustomsSeal(g, s, cx, cy, k);
      break;
    case 'ivory_sample':
      drawIvorySample(g, s, cx, cy, k);
      break;
    default: {
      // 新增 ItemId 却忘了配图标时，在编译期就报出来，而不是运行时画个空白格
      const unhandled: never = id;
      throw new Error(`未配图标的道具：${String(unhandled)}`);
    }
  }
}
