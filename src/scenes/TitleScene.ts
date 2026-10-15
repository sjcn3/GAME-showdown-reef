import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAPTER_FIRST_SCENE } from '../data/chapters';
import { DEBUG_ENTRY, DEBUG_PANEL_OPEN } from '../debugPanel';
import { gameState } from '../store';
import { CreditsPanel } from '../ui/CreditsPanel';
import { FONT_SANS, FONT_SERIF, makeButton, toCss } from '../ui/theme';
import { addRain, addShimmer, type ShimmerBand } from '../art/ambient';

/** 地平线。天空在上面，水在下面，礁石压在交界处 */
const HORIZON = 620;
/** 月亮（只有一团晕，没有硬边圆盘 —— 硬边圆盘会和标题抢注意力） */
const MOON_X = 588;
const MOON_Y = 158;
/** 水面反光条。交给 addShimmer 之后它们会自己漂 */
const WATER_BANDS: readonly ShimmerBand[] = Array.from({ length: 16 }, (_, i) => ({
  y: 646 + i * 30,
  x: (i * 211) % 460,
  w: 120 + ((i * 97) % 300),
  alpha: 0.1 + ((i % 3) * 0.04),
}));

/** 两色线性插值 */
function lerpColor(a: number, b: number, t: number): number {
  const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
  const g = Math.round(((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t);
  const bl = Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t);
  return (r << 16) | (g << 8) | bl;
}

/**
 * 竖直渐变。
 *
 * 段数不能少：一开始天空只分了 7 段，每段 88px、相邻色差又大，
 * 屏幕上是七条硬边横带 —— 一眼看成渲染坏了。夜里那段色域本来就窄，
 * 靠"少画几段"省不下来什么，段数给够（每段 5px 上下）才连成一片。
 */
function verticalGradient(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  from: number,
  to: number,
): void {
  const steps = Math.max(24, Math.round(h / 5));
  const sh = h / steps;
  for (let i = 0; i < steps; i += 1) {
    g.fillStyle(lerpColor(from, to, i / (steps - 1)), 1);
    g.fillRect(x, y + i * sh, w, sh + 1);
  }
}

export class TitleScene extends Phaser.Scene {
  /**
   * 标题页每个按钮的中心（游戏坐标），键是按钮上的文字。
   * 只给开发钩子（`?dev=1`）用：烟测脚本要按名字点按钮，不能写死坐标 ——
   * 写死的坐标在别的窗口尺寸下会点在空气上，而脚本仍然报告"通过"。
   */
  readonly devButtons: Record<string, { x: number; y: number }> = {};

  private credits!: CreditsPanel;

  constructor() {
    super('Title');
  }

  /** 制作信息面板开着没有（开发钩子用） */
  devCreditsOpen(): boolean {
    return this.credits.isOpen;
  }

  /** 建一个按钮，顺手把它登记进 devButtons。 */
  private button(
    y: number,
    text: string,
    onClick: () => void,
    opts?: Parameters<typeof makeButton>[5],
  ): void {
    makeButton(this, GAME_WIDTH / 2, y, text, onClick, opts);
    this.devButtons[text] = { x: GAME_WIDTH / 2, y };
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.drawReef();
    this.makeCoin();

    // 制作信息面板：常驻实例，靠 setVisible 开关（见 CreditsPanel 的注释）
    this.credits = new CreditsPanel(this);
    this.devButtons['关闭制作信息'] = this.credits.closeButtonCenter;

    this.add
      .text(GAME_WIDTH / 2, 300, '暗 礁', {
        fontFamily: FONT_SERIF,
        fontSize: '96px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5)
      .setShadow(0, 6, '#000000', 18, false, true);

    this.add
      .text(GAME_WIDTH / 2, 380, '2 0 2 6 · 沧 澜 港', {
        fontFamily: FONT_SANS,
        fontSize: '20px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setLetterSpacing(4);

    // 三个按钮等高等距。
    // 原来是 880/980/1064 配 76/68/60 —— 主次靠"越往下越扁"来表达，
    // 第 3 个比第 1 个矮了 16px，看着像没对齐而不是像层级。
    // 层级改用文字颜色和字号表达，几何一律统一。
    this.button(884, '开始调查', () => {
      gameState.reset();
      this.scene.start('Explore', { sceneId: CHAPTER_FIRST_SCENE[0]! });
    }, {
      width: 380,
      height: 72,
      fontSize: 26,
      font: FONT_SERIF,
      fill: 0x1c2932,
      hover: 0x2b3d47,
      stroke: 0x44606e,
    });

    this.button(980, '结局图鉴', () => {
      this.scene.start('Gallery');
    }, { width: 380, height: 72, fontSize: 22 });

    // 调试面板的入口。开不开由 `src/debugPanel.ts` 一行决定（见那个文件的注释）。
    // 关掉时**只跳过这一格**，上面两格的 y 一动不动 ——
    // 开关不允许改变正式界面的版面。
    if (DEBUG_PANEL_OPEN) {
      this.button(DEBUG_ENTRY.y, DEBUG_ENTRY.label, () => {
        this.scene.start(DEBUG_ENTRY.sceneKey);
      }, {
        width: DEBUG_ENTRY.width,
        height: DEBUG_ENTRY.height,
        fontSize: DEBUG_ENTRY.fontSize,
        textColor: DEBUG_ENTRY.textColor,
      });
    }

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 56, '‘钱江杯’大学生反走私创作比赛作品', {
        fontFamily: FONT_SANS,
        fontSize: '16px',
        color: '#55646e',
      })
      .setOrigin(0.5);
  }

  /**
   * 标题页背景：夜里的澜沧港。
   *
   * 原来这里只有一块平涂的天空 + 一块平涂的水 + 14 条不动的反光条 + 一个
   * 单色礁石多边形，整页最大的信息量是那三个按钮。标题页是玩家看到的第一帧，
   * 它得先自己说清楚"这是个什么故事"。
   *
   * 深度全部走负值，UI 和标题文字留在 0：
   *   -10 天空 / 水面 / 月亮 / 港区剪影
   *    -6 水面反光（会动；必须压在礁石**前面**，所以礁石得另外一层）
   *    -2 礁石
   *    -1 雨（在礁石前面 —— 这是前景的雨）
   */
  private drawReef(): void {
    const back = this.add.graphics().setDepth(-10);

    // ── 天空：上暗下亮，越靠近地平线越透一点光 ──
    verticalGradient(back, 0, 0, GAME_WIDTH, HORIZON, 0x06090e, 0x182836);

    // ── 月亮：同心圆叠出来的光晕，越往外每圈越淡；本体只有一小颗 ──
    for (let i = 10; i >= 1; i -= 1) {
      back.fillStyle(0x9fb8c8, 0.012 + (10 - i) * 0.004);
      back.fillCircle(MOON_X, MOON_Y, i * 10.4);
    }
    back.fillStyle(0xd6e4ec, 0.5);
    back.fillCircle(MOON_X, MOON_Y, 5);

    // ── 港区剪影：仓库 + 两台吊机。压得比天空暗，读的就是轮廓 ──
    const SIL = 0x080e13;
    back.fillStyle(SIL, 1);
    back.fillRect(150, 570, 120, 50);
    back.fillRect(300, 584, 90, 36);
    back.fillRect(470, 578, 110, 42);
    // 吊机 A
    back.fillRect(94, 470, 4, 150);
    back.fillRect(96, 468, 60, 3);
    back.fillRect(150, 471, 2, 42);
    back.fillRect(145, 513, 12, 6);
    // 吊机 B（朝左伸）
    back.fillRect(638, 496, 4, 124);
    back.fillRect(586, 494, 56, 3);
    back.fillRect(592, 497, 2, 44);
    back.fillRect(587, 541, 12, 6);
    // 灯
    back.fillStyle(0xc9a227, 0.5);
    back.fillCircle(96, 467, 3);
    back.fillCircle(640, 493, 3);
    back.fillStyle(0xc9a227, 0.3);
    back.fillCircle(150, 470, 2);
    back.fillCircle(592, 496, 2);
    back.fillCircle(178, 566, 2);
    back.fillCircle(500, 574, 2);

    // ── 水面：越远越亮，越近越黑 ──
    verticalGradient(back, 0, HORIZON, GAME_WIDTH, GAME_HEIGHT - HORIZON, 0x17262f, 0x070d12);

    // 地平线本身
    back.fillStyle(0x2a3d49, 0.55);
    back.fillRect(0, HORIZON - 1, GAME_WIDTH, 1);

    // 月亮在水里的倒影：一列越往下越窄越淡的横条
    for (let i = 0; i < 14; i += 1) {
      const w = 96 - i * 6;
      if (w <= 6) break;
      back.fillStyle(0x9fb4c2, 0.11 - i * 0.007);
      back.fillRect(MOON_X - w / 2, 634 + i * 17, w, 2);
    }

    // ── 水面反光（会漂）──
    addShimmer(this, WATER_BANDS, 0x4d7f96, -6);

    // ── 礁石 ──
    const fg = this.add.graphics().setDepth(-2);
    fg.fillStyle(0x1b2329, 1);
    fg.fillPoints(
      [
        new Phaser.Math.Vector2(90, 760),
        new Phaser.Math.Vector2(210, 660),
        new Phaser.Math.Vector2(300, 700),
        new Phaser.Math.Vector2(360, 640),
        new Phaser.Math.Vector2(470, 730),
        new Phaser.Math.Vector2(560, 690),
        new Phaser.Math.Vector2(660, 780),
        new Phaser.Math.Vector2(660, 900),
        new Phaser.Math.Vector2(90, 900),
      ],
      true,
    );
    // 迎光的那条棱。单色多边形在夜里读不出体积，全靠这一笔
    fg.lineStyle(2, 0x33454f, 0.75);
    fg.beginPath();
    fg.moveTo(90, 760);
    fg.lineTo(210, 660);
    fg.lineTo(300, 700);
    fg.lineTo(360, 640);
    fg.lineTo(470, 730);
    fg.lineTo(560, 690);
    fg.lineTo(660, 780);
    fg.strokePath();

    // 礁石上的刻痕
    fg.lineStyle(2, 0x2c3a42, 1);
    fg.lineBetween(300, 700, 360, 640);
    fg.lineBetween(430, 700, 480, 736);

    // ── 雨。只铺到按钮上面（884）为止，别落到 UI 上 ──
    addRain(this, {
      x: 0,
      y: 0,
      w: GAME_WIDTH,
      h: 880,
      count: 150,
      color: 0x9fb0bb,
      minAlpha: 0.05,
      alphaStep: 0.03,
      slant: 15,
      lenMin: 34,
      lenMax: 78,
      fallMs: 2100,
      seed: 5,
      depth: -1,
    });
  }

  /**
   * 沉在水里的铜徽。它同时是标题页唯一的隐藏入口：点它弹制作信息。
   *
   * 命中区半径给到 46，而图形只有 30 —— 手机上 60px 的靶子折合
   * 只有 32 个 CSS 像素，手指点不准；多出来的 16px 是看不见的，
   * 不参与构图，也不跟旁边的标语打架。
   */
  private makeCoin(): void {
    const cx = 104;
    const cy = 1156;
    const r = 30;

    const coin = this.add.graphics();
    coin.fillStyle(0x6b5a24, 0.85);
    coin.fillCircle(cx, cy, r);
    coin.lineStyle(3, 0x8a7430, 0.9);
    coin.strokeCircle(cx, cy, r);
    coin.beginPath();
    coin.moveTo(cx - 17, cy + 14);
    coin.lineTo(cx - 5, cy - 10);
    coin.lineTo(cx + 4, cy + 9);
    coin.lineTo(cx + 16, cy - 15);
    coin.strokePath();

    // 一圈很淡的呼吸光：暗示"这个能点"，又不至于把退潮后的构图搅乱
    const halo = this.add.graphics();
    halo.lineStyle(2, 0xc9a227, 0.55);
    halo.strokeCircle(cx, cy, r + 10);
    halo.setAlpha(0.16);
    this.tweens.add({
      targets: halo,
      alpha: 0.46,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const hit = this.add
      .circle(cx, cy, 46, 0x000000, 0)
      .setInteractive({
        hitArea: new Phaser.Geom.Circle(46, 46, 46),
        hitAreaCallback: Phaser.Geom.Circle.Contains,
        useHandCursor: true,
      });
    hit.on('pointerover', () => coin.setAlpha(1));
    hit.on('pointerout', () => coin.setAlpha(0.85));
    hit.on('pointerdown', () => this.credits.open());

    this.devButtons['硬币'] = { x: cx, y: cy };
  }
}
