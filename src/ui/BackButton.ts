/**
 * 右上角的返回按钮（C2）
 *
 * 在这之前，返回标题页只有 ESC 一条路 —— 真机没有键盘，手机玩家进了游戏
 * 就再也出不去了。桌面上这是个"反正有快捷键"的小问题，手机上它是死路。
 *
 * 为什么要点两下才走：这一下会丢掉整局（本作没有中途存档，存档里只有
 * 结局图鉴）。拇指在场景上乱点、或者只是想把浮层点掉时误触，代价太大。
 * 第一下只把按钮变成「再点一次返回标题」，2.6 秒内没人理它就自己缩回去。
 *
 * 为什么是两块矩形而不是一块 `setSize()` 的矩形：命中区是 `setInteractive()`
 * 那一刻按当时的尺寸定下的，之后再改尺寸，Phaser 不会跟着更新 hitArea ——
 * 按钮看着变宽了，实际只有右半边能点。宁可多一块矩形，也不要这种"看得见
 * 点不着"的东西。
 *
 * 为什么需要一个 `isBlocked` 回调：Phaser 的 GameObject 输入不看深度 ——
 * 文档浮层盖住整个屏幕时，这个按钮仍然会收到点击。不挡住它，玩家在
 * 阅读提货单时点一下右上角，就凭空 arm 了一次返回。
 */

import Phaser from 'phaser';

import { COLORS, GAME_WIDTH } from '../config';
import { FONT_SANS, toCss } from './theme';

const TOP = 18;
const H = 40;
const W_IDLE = 48;
const W_ARMED = 214;
const RIGHT = GAME_WIDTH - 16;
const ARM_MS = 2600;

/** 盖在所有浮层之下、场景之上 */
const DEPTH = 460;

export class BackButton {
  private readonly idle: Phaser.GameObjects.Rectangle;
  private readonly armedRect: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private armed = false;
  private timer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    /** 返回 true = 现在有浮层盖着，这一下不算数 */
    private readonly isBlocked: () => boolean,
    private readonly onConfirm: () => void,
  ) {
    this.idle = this.rect(W_IDLE, 0x111820, 0x33454f, 0.9);
    this.armedRect = this.rect(W_ARMED, 0x3a1f1c, COLORS.danger, 1);
    this.armedRect.setVisible(false).disableInteractive();

    this.label = scene.add
      .text(RIGHT - W_IDLE / 2, TOP + H / 2, '≡', {
        fontFamily: FONT_SANS,
        fontSize: '22px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);

    this.idle.on('pointerdown', () => this.arm());
    this.armedRect.on('pointerdown', () => this.confirm());

    this.idle.on('pointerover', () => this.idle.setStrokeStyle(1, 0x4a606e, 1));
    this.idle.on('pointerout', () => this.idle.setStrokeStyle(1, 0x33454f, 0.9));
  }

  private rect(w: number, fill: number, stroke: number, strokeAlpha: number): Phaser.GameObjects.Rectangle {
    return this.scene.add
      .rectangle(RIGHT, TOP, w, H, fill, 0.95)
      .setOrigin(1, 0)
      .setStrokeStyle(1, stroke, strokeAlpha)
      .setDepth(DEPTH)
      .setInteractive({ useHandCursor: true });
  }

  /** 命中区判定。场景用它把这一下从热点点击里摘出去。 */
  hitTest(x: number, y: number): boolean {
    if (this.armed) return this.armedRect.getBounds().contains(x, y);
    return this.idle.getBounds().contains(x, y);
  }

  get isArmed(): boolean {
    return this.armed;
  }

  private arm(): void {
    if (this.armed || this.isBlocked()) return;
    this.armed = true;
    this.idle.setVisible(false).disableInteractive();
    this.armedRect.setVisible(true).setInteractive({ useHandCursor: true });
    this.label
      .setText('再点一次返回标题')
      .setFontSize(15)
      .setColor(toCss(COLORS.ink))
      .setX(RIGHT - W_ARMED / 2);
    this.timer = this.scene.time.delayedCall(ARM_MS, () => this.disarm());
  }

  private confirm(): void {
    if (this.isBlocked()) return;
    this.timer?.remove();
    this.onConfirm();
  }

  private disarm(): void {
    if (!this.armed) return;
    this.armed = false;
    this.armedRect.setVisible(false).disableInteractive();
    this.idle.setVisible(true).setStrokeStyle(1, 0x33454f, 0.9).setInteractive({ useHandCursor: true });
    this.label.setText('≡').setFontSize(22).setColor(toCss(COLORS.inkDim)).setX(RIGHT - W_IDLE / 2);
  }

  /** 仅供开发钩子：按钮的中心点，以及它现在是不是"待确认"状态。 */
  devState(): { x: number; y: number; armed: boolean } {
    const w = this.armed ? W_ARMED : W_IDLE;
    return { x: Math.round(RIGHT - w / 2), y: TOP + H / 2, armed: this.armed };
  }
}
