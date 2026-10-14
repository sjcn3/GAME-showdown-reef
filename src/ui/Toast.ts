/**
 * 顶部轻提示 / 居中强调提示（设计文档 9.3）
 *
 * - 顶部胶囊：获得道具、场景切换等瞬时反馈
 * - 居中面板：「要不要再找找？」——3~5 秒自动消失，之后玩家再点同一热点才推进章节
 */

import type Phaser from 'phaser';

import { COLORS, GAME_WIDTH, SEARCH_AGAIN_HINT_MS } from '../config';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';

export interface ToastOptions {
  /** 毫秒；省略用默认值 */
  readonly ms?: number;
  /** 居中强调样式 */
  readonly emphasis?: boolean;
}

/**
 * 轻提示的层级：在舞台、文本框（500）、道具栏（600）之上，
 * 在所有浮层之下 —— 闪回 700、证据列表 780、原件 800、章节卡 950。
 *
 * 这里原来写的是 900，比全部浮层都高。结果是刚捡到东西就点开证据列表时，
 * 「获得「××」」会横在面板标题上，看着像层级坏了 —— 而浮层是玩家主动打开的，
 * 那一刻屏幕该归它管。提示只在"没有浮层"的普通游玩里需要被看见。
 */
const TOAST_DEPTH = 660;

export class Toast {
  private readonly container: Phaser.GameObjects.Container;
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;

  constructor(private readonly scene: Phaser.Scene) {
    this.box = scene.add.graphics();
    this.label = scene.add.text(0, 0, '', { fontFamily: FONT_SANS, fontSize: '18px' }).setOrigin(0.5);
    this.container = scene.add.container(0, 0, [this.box, this.label]).setDepth(TOAST_DEPTH).setVisible(false);
  }

  show(text: string, options: ToastOptions = {}): void {
    const emphasis = options.emphasis ?? false;
    const ms = options.ms ?? (emphasis ? SEARCH_AGAIN_HINT_MS : 2000);

    this.timer?.remove();
    this.timer = undefined;

    this.label
      .setText(text)
      .setFontFamily(emphasis ? FONT_SERIF : FONT_SANS)
      .setFontSize(emphasis ? 24 : 18)
      .setColor(toCss(emphasis ? COLORS.ink : COLORS.paper));

    const padX = emphasis ? 44 : 26;
    const padY = emphasis ? 28 : 14;
    const maxTextWidth = GAME_WIDTH - 120;

    this.label.setWordWrapWidth(maxTextWidth, true);
    this.label.setAlign('center');

    const finalW = Math.min(this.label.width + padX * 2, GAME_WIDTH - 60);
    const finalH = this.label.height + padY * 2;

    const cx = GAME_WIDTH / 2;
    const cy = emphasis ? 600 : 140;

    this.box.clear();
    this.box.fillStyle(emphasis ? 0x0d1216 : 0x151d22, emphasis ? 0.96 : 0.92);
    this.box.fillRoundedRect(cx - finalW / 2, cy - finalH / 2, finalW, finalH, emphasis ? 10 : finalH / 2);
    this.box.lineStyle(1, emphasis ? 0x4a5a66 : 0x33454f, 1);
    this.box.strokeRoundedRect(cx - finalW / 2, cy - finalH / 2, finalW, finalH, emphasis ? 10 : finalH / 2);

    this.label.setPosition(cx, cy);

    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 180 });

    this.timer = this.scene.time.delayedCall(ms, () => this.hide());
  }

  hide(): void {
    this.timer?.remove();
    this.timer = undefined;
    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 220,
      onComplete: () => this.container.setVisible(false),
    });
  }
}
