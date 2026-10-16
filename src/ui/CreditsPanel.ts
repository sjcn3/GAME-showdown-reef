import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';

/**
 * 制作信息面板（标题页铜徽点开）。
 *
 * 内容分两块，都在本文件顶部：
 *   `ROWS` —— 七行「标签 / 值」，值还在逐行替换真名（没填的留着 `AAAAA`）；
 *   `NOTE` —— 面板底部单独居中的一整句声明（AI 使用说明）。
 * 两者版面都是按内容算出来的，改字不用动坐标。
 *
 * 关闭逻辑挂在**全屏背板自己身上**，不是靠场景转发坐标 ——
 * 这是 C1 证据列表踩过的坑：打开浮层的同一下点击如果被场景层转发进来，
 * 会当场把刚开的浮层关掉（那一下落在面板外）。背板随容器一起由
 * `setVisible(false)` 变成可见，而这一次点击的命中列表在它变可见之前
 * 就已经算完了，所以它只会接住下一根手指。
 */

const PANEL_W = 560;
// 顶边 372 是量出来的：标题「暗 礁」是 96px 字号、中心 y=300，
// 墨迹压到约 y350。面板从 340 起会把标题的下半截切掉，看着像没画完。
const PANEL_TOP = 372;
// 600 = 七行内容（到 y846）+ 底部那句 AI 声明（y890）+ 关闭提示（y940）留出的余量。
// 面板只往下长，顶边 372 不能动；再加行的话这个数要跟着加，否则会和底部撞上。
const PANEL_H = 600;
const DEPTH = 700;

/** 底部那句声明离面板底边的距离；关闭提示在 -32，声明在它上面 50px */
const NOTE_FROM_BOTTOM = 82;

const ROWS: readonly (readonly [string, string])[] = [
  ['制 作 人', '陈超'],
  ['音 效', 'DeepseekV41flash'],
  ['剧 本', '豆包'],
  ['美 术', '通义Qwen Deepseek'],
  ['程 序', 'DeepseekV41flash'],
  ['指导老师', '无'],
  ['特别鸣谢', 'chatGPT '],
];

/**
 * 面板底部的一句声明。
 *
 * 它**不进 ROWS** —— 那不是「标签 / 值」的关系，是一句整话，
 * 挤进两列表格里会既不像标签也不像值。单独居中一行。
 */
const NOTE = '本游戏由AI辅助制作';

export class CreditsPanel {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private running = false;

  /** ✕ 的中心（游戏坐标）—— 标题页把它登记进 devButtons，脚本才能按名字点 */
  readonly closeButtonCenter: { x: number; y: number } = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    const cx = GAME_WIDTH / 2;
    const panelCy = PANEL_TOP + PANEL_H / 2;

    // 背板：铺满全屏，点它关闭
    const dim = scene.add
      .rectangle(cx, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.76)
      .setInteractive({ useHandCursor: true });
    dim.on('pointerdown', () => this.close());

    // 面板本体也要可点，否则点在面板上会穿透到背板把浮层关掉
    const panel = scene.add
      .rectangle(cx, panelCy, PANEL_W, PANEL_H, 0x0d1418, 0.99)
      .setStrokeStyle(1, 0x33454f)
      .setInteractive();

    const title = scene.add
      .text(cx, PANEL_TOP + 62, '制 作 信 息', {
        fontFamily: FONT_SERIF,
        fontSize: '34px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    const rule = scene.add.graphics();
    rule.lineStyle(1, 0x33454f, 0.9);
    rule.lineBetween(cx - 220, PANEL_TOP + 104, cx + 220, PANEL_TOP + 104);

    const body: Phaser.GameObjects.Text[] = [];
    ROWS.forEach(([label, value], i) => {
      const y = PANEL_TOP + 150 + i * 54;
      body.push(
        scene.add
          .text(cx - 60, y, label, {
            fontFamily: FONT_SANS,
            fontSize: '19px',
            color: toCss(COLORS.inkDim),
          })
          .setOrigin(1, 0.5),
        scene.add
          .text(cx - 30, y, value, {
            fontFamily: FONT_SERIF,
            fontSize: '21px',
            color: toCss(COLORS.ink),
          })
          .setOrigin(0, 0.5),
      );
    });

    // 那句 AI 声明。颜色用 inkDim（和左边一列标签同色），
    // 比它下面的「点击面板外关闭」亮一档 —— 前者是内容，后者是操作提示。
    const note = scene.add
      .text(cx, PANEL_TOP + PANEL_H - NOTE_FROM_BOTTOM, NOTE, {
        fontFamily: FONT_SANS,
        fontSize: '16px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5);

    const hint = scene.add
      .text(cx, PANEL_TOP + PANEL_H - 32, '点击面板外关闭', {
        fontFamily: FONT_SANS,
        fontSize: '15px',
        color: '#55646e',
      })
      .setOrigin(0.5);

    // ✕：给一个看得见的关闭口，也给脚本一个不用猜坐标的落点
    const closeX = cx + PANEL_W / 2 - 34;
    const closeY = PANEL_TOP + 34;
    const closeHit = scene.add
      .rectangle(closeX, closeY, 44, 44, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    const closeGlyph = scene.add
      .text(closeX, closeY, '✕', {
        fontFamily: FONT_SANS,
        fontSize: '22px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5);
    closeHit.on('pointerover', () => closeGlyph.setColor(toCss(COLORS.ink)));
    closeHit.on('pointerout', () => closeGlyph.setColor(toCss(COLORS.inkDim)));
    closeHit.on('pointerdown', () => this.close());
    this.closeButtonCenter.x = closeX;
    this.closeButtonCenter.y = closeY;

    this.container = scene.add
      .container(0, 0, [dim, panel, title, rule, ...body, note, hint, closeHit, closeGlyph])
      .setDepth(DEPTH)
      .setVisible(false);
  }

  get isOpen(): boolean {
    return this.running;
  }

  open(): void {
    if (this.running) return;
    this.running = true;
    this.container.setVisible(true);
  }

  close(): void {
    if (!this.running) return;
    this.running = false;
    this.container.setVisible(false);
  }
}
