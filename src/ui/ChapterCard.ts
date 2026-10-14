/**
 * 章节卡（设计文档 9.4 / 剧本「章节卡」）
 *
 * 全屏黑 + 章节名 + 时间。淡入 → 停留 → 淡出，点击可提前跳过。
 * 由 ExploreScene 在 advanceChapter 时调用。
 */

import type Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAPTERS } from '../data/chapters';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';

const FADE_IN = 420;
const HOLD = 1700;
const FADE_OUT = 520;

export class ChapterCard {
  private readonly container: Phaser.GameObjects.Container;
  private readonly title: Phaser.GameObjects.Text;
  private readonly time: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private finish: (() => void) | null = null;
  private running = false;

  constructor(private readonly scene: Phaser.Scene) {
    const bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 1).setOrigin(0, 0);

    this.title = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 60, '', {
        fontFamily: FONT_SERIF,
        fontSize: '46px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    this.time = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24, '', {
        fontFamily: FONT_SANS,
        fontSize: '21px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setLetterSpacing(3);

    const rule = scene.add.graphics();
    rule.lineStyle(1, 0x4a5a66, 0.9);
    rule.lineBetween(GAME_WIDTH / 2 - 150, GAME_HEIGHT / 2, GAME_WIDTH / 2 + 150, GAME_HEIGHT / 2);

    this.container = scene.add
      .container(0, 0, [bg, this.title, rule, this.time])
      .setDepth(950)
      .setVisible(false)
      .setAlpha(0);
  }

  get isActive(): boolean {
    return this.running;
  }

  show(index: number): Promise<void> {
    const meta = CHAPTERS[index];
    this.title.setText(meta?.title ?? `第 ${index + 1} 章`);
    this.time.setText(meta?.time ?? '');
    this.running = true;

    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: FADE_IN });

    return new Promise<void>((res) => {
      this.finish = res;
      this.timer?.remove();
      this.timer = this.scene.time.delayedCall(FADE_IN + HOLD, () => this.hide());
    });
  }

  /** 点击跳过：立刻进入淡出 */
  tap(): boolean {
    if (!this.running) return false;
    this.hide();
    return true;
  }

  private hide(): void {
    if (!this.running) return;
    this.running = false;
    this.timer?.remove();
    this.timer = undefined;

    this.scene.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: FADE_OUT,
      onComplete: () => {
        this.container.setVisible(false);
        const done = this.finish;
        this.finish = null;
        done?.();
      },
    });
  }
}
