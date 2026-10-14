import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAPTER_FIRST_SCENE } from '../data/chapters';
import { gameState } from '../store';
import { FONT_SANS, FONT_SERIF, makeButton, toCss } from '../ui/theme';

export class TitleScene extends Phaser.Scene {
  /**
   * 标题页每个按钮的中心（游戏坐标），键是按钮上的文字。
   * 只给开发钩子（`?dev=1`）用：烟测脚本要按名字点按钮，不能写死坐标 ——
   * 写死的坐标在别的窗口尺寸下会点在空气上，而脚本仍然报告"通过"。
   */
  readonly devButtons: Record<string, { x: number; y: number }> = {};

  constructor() {
    super('Title');
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

    this.button(1076, '判定表 · 调试面板', () => {
      this.scene.start('Debug');
    }, { width: 380, height: 72, fontSize: 19, textColor: COLORS.inkDim });

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 56, '锈湖式点击解谜 · 反走私', {
        fontFamily: FONT_SANS,
        fontSize: '16px',
        color: '#55646e',
      })
      .setOrigin(0.5);
  }

  /** 退潮后的礁石 + 沉在浅水里的铜徽（占位构图，P5 换成正式美术） */
  private drawReef(): void {
    const g = this.add.graphics();

    // 浅水
    g.fillStyle(0x12202a, 1);
    g.fillRect(0, 620, GAME_WIDTH, GAME_HEIGHT - 620);

    // 水面反光
    g.fillStyle(0x1a2f3b, 1);
    for (let i = 0; i < 14; i++) {
      const y = 640 + i * 34;
      const w = 120 + ((i * 97) % 420);
      const x = ((i * 211) % (GAME_WIDTH - w)) | 0;
      g.fillRect(x, y, w, 2);
    }

    // 礁石
    g.fillStyle(0x1b2329, 1);
    g.fillPoints(
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

    // 礁石上的刻痕
    g.lineStyle(2, 0x2c3a42, 1);
    g.lineBetween(300, 700, 360, 640);
    g.lineBetween(430, 700, 480, 736);

    // 沉在水里的铜徽（放在按钮下方的空水域，避免压住 UI）
    const cx = 104;
    const cy = 1156;
    g.fillStyle(0x6b5a24, 0.85);
    g.fillCircle(cx, cy, 30);
    g.lineStyle(3, 0x8a7430, 0.9);
    g.strokeCircle(cx, cy, 30);
    g.beginPath();
    g.moveTo(cx - 17, cy + 14);
    g.lineTo(cx - 5, cy - 10);
    g.lineTo(cx + 4, cy + 9);
    g.lineTo(cx + 16, cy - 15);
    g.strokePath();
  }
}
