/**
 * 序 · 开场（剧本 序）
 *
 * 黑屏 + 两句独白 → 点击 → 标题画面。
 * 放在标题之前，是为了让「十年前的同一天」这句先落地：
 * 玩家在还不知道这是哪一天的时候，先知道今天很重。
 */

import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { PROLOGUE_LINES } from '../data/chapters';
import { FONT_SANS, FONT_SERIF, toCss } from '../ui/theme';

export class PrologueScene extends Phaser.Scene {
  constructor() {
    super('Prologue');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(0x000000);

    const text = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 40, PROLOGUE_LINES.join('\n'), {
        fontFamily: FONT_SERIF,
        fontSize: '26px',
        color: toCss(COLORS.ink),
        align: 'center',
        lineSpacing: 22,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 150, '点击继续', {
        fontFamily: FONT_SANS,
        fontSize: '18px',
        // 唯一的操作提示不该是全屏最暗的字：原来是 #4d5c66，对纯黑只有 2.71:1
        color: '#8a949c',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // 一直在那儿的静态文字，在纯黑底上很容易被当成排版的一部分
    const caret = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 118, '▾', {
        fontFamily: FONT_SANS,
        fontSize: '22px',
        color: '#8a949c',
      })
      .setOrigin(0.5)
      .setAlpha(0);

    this.tweens.add({ targets: text, alpha: 1, duration: 1200, delay: 400 });
    this.tweens.add({ targets: hint, alpha: 1, duration: 800, delay: 1800 });
    this.tweens.add({
      targets: caret,
      alpha: 1,
      duration: 800,
      delay: 1800,
      onComplete: () => {
        this.tweens.add({ targets: caret, alpha: 0.3, duration: 900, yoyo: true, repeat: -1 });
      },
    });

    this.time.delayedCall(1200, () => {
      this.input.once('pointerdown', () => this.scene.start('Title'));
      this.input.keyboard?.once('keydown', () => this.scene.start('Title'));
    });
  }
}
