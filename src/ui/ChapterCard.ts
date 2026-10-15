/**
 * 章节卡（设计文档 9.4 / 剧本「章节卡」）
 *
 * 全屏黑 + 章节名 + 时间。淡入 → 停留 → 淡出，点击可提前跳过。
 * 由 ExploreScene 在 advanceChapter 时调用。
 *
 * 这里原来只有两行字浮在纯黑上（46px 标题 + 21px 时间 + 一条 300px 的横线），
 * 三章长得完全一样，玩家读到的是"又弹了一次黑屏"，而不是"换章了"。
 * 现在每一章有自己的**色调**（CHAPTERS[i].tint：黄昏暖 / 深夜蓝 / 雨夜近黑）、
 * 自己的**序号水印**，并且补上了这一章「在哪」——ChapterMeta.hint 一直有数据，
 * 只是从来没上过卡。
 */

import type Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAPTERS } from '../data/chapters';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';

const FADE_IN = 420;
const HOLD = 1700;
const FADE_OUT = 520;

const CX = GAME_WIDTH / 2;
const CY = GAME_HEIGHT / 2;

const PANEL_W = 500;
const PANEL_H = 320;
/** 四角的 L 形角标长度 */
const TICK = 26;

export class ChapterCard {
  private readonly container: Phaser.GameObjects.Container;
  private readonly wash: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Rectangle;
  private readonly mark: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private readonly accent: Phaser.GameObjects.Rectangle;
  private readonly title: Phaser.GameObjects.Text;
  private readonly time: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private timer?: Phaser.Time.TimerEvent;
  private finish: (() => void) | null = null;
  private running = false;

  constructor(private readonly scene: Phaser.Scene) {
    const bg = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05080b, 1).setOrigin(0, 0);

    // 整屏色调：三章各自一层很淡的色，换章时"空气"是不一样的
    this.wash = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 1).setOrigin(0, 0);

    // 序号水印。挂在面板后面，只比背景亮一点点 —— 它的作用是让三张卡
    // 即使遮住文字也能一眼分出是第几章
    this.mark = scene.add
      .text(CX, CY + 6, '', {
        fontFamily: FONT_SERIF,
        fontSize: '176px',
        color: '#0f171e',
      })
      .setOrigin(0.5);

    // 面板：底色跟着章节 tint 走，所以三章的"卡"本身颜色不同
    this.panel = scene.add
      .rectangle(CX, CY, PANEL_W, PANEL_H, 0xffffff, 1)
      .setStrokeStyle(1, 0x3f505c, 0.9);

    // 角标是静态的，画一次就够
    const ticks = scene.add.graphics();
    ticks.lineStyle(1, 0x5c7480, 0.75);
    const l = CX - PANEL_W / 2;
    const r = CX + PANEL_W / 2;
    const t = CY - PANEL_H / 2;
    const b = CY + PANEL_H / 2;
    for (const [x, y, dx, dy] of [
      [l, t, 1, 1],
      [r, t, -1, 1],
      [l, b, 1, -1],
      [r, b, -1, -1],
    ] as const) {
      ticks.lineBetween(x, y, x + TICK * dx, y);
      ticks.lineBetween(x, y, x, y + TICK * dy);
    }

    this.label = scene.add
      .text(CX, CY - 100, '', {
        fontFamily: FONT_SERIF,
        fontSize: '20px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setLetterSpacing(10);

    // 这道短横线是入场时唯一会动的元素：从中间向两侧长出来
    this.accent = scene.add.rectangle(CX, CY - 68, 56, 2, COLORS.accent, 1).setOrigin(0.5);

    this.title = scene.add
      .text(CX, CY - 14, '', {
        fontFamily: FONT_SERIF,
        fontSize: '46px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    const hair = scene.add.graphics();
    hair.lineStyle(1, 0x35454f, 0.9);
    hair.lineBetween(CX - 110, CY + 42, CX + 110, CY + 42);

    this.time = scene.add
      .text(CX, CY + 72, '', {
        fontFamily: FONT_SANS,
        fontSize: '19px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setLetterSpacing(3);

    this.hint = scene.add
      .text(CX, CY + 108, '', {
        fontFamily: FONT_SANS,
        fontSize: '14px',
        color: '#54666f',
      })
      .setOrigin(0.5);

    this.container = scene.add
      .container(0, 0, [
        bg,
        this.wash,
        this.mark,
        this.panel,
        ticks,
        this.label,
        this.accent,
        this.title,
        hair,
        this.time,
        this.hint,
      ])
      .setDepth(950)
      .setVisible(false)
      .setAlpha(0);
  }

  get isActive(): boolean {
    return this.running;
  }

  show(index: number): Promise<void> {
    const meta = CHAPTERS[index];
    const raw = meta?.title ?? `第 ${index + 1} 章`;
    // 「第一章 · 异常集装箱」拆成「第一章」+「异常集装箱」：
    // 章节号和章名是两种东西，挤在一行 46px 里读不出层次
    const parts = raw.split(' · ');
    const label = parts.length > 1 ? parts[0]! : `第 ${index + 1} 章`;
    const name = parts.length > 1 ? parts[1]! : parts[0]!;

    this.label.setText(label);
    this.title.setText(name);
    this.time.setText(meta?.time ?? '');
    this.hint.setText(meta?.hint ?? '');
    this.mark.setText(String(index + 1).padStart(2, '0'));

    const tint = meta?.tint ?? 0x000000;
    this.wash.setFillStyle(tint, 0.16);
    this.panel.setFillStyle(tint, 0.55);

    this.running = true;
    this.accent.setScale(0, 1);
    this.scene.tweens.add({
      targets: this.accent,
      scaleX: 1,
      duration: 520,
      ease: 'Cubic.easeOut',
    });

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
