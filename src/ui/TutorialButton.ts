/**
 * 左上角的「?」按钮（X2）
 *
 * 教学关掉之后得有地方再看 —— 「忘了怎么玩」是必然会发生的，
 * 而「重开一局才能再看一遍教学」等于没有教学。
 *
 * 造型与右上角的返回按钮同款（同尺寸、同色、同深度），只是镜像到左边：
 * 两个角上一左一右长得一样，玩家不用再学一套新的按钮语言。
 * 图标用「?」而不是照抄右边的「≡」—— 两个角落放两个一模一样的图标、
 * 点下去一个退出一个弹教学，那才是真的会点错。
 *
 * 为什么不做「点两下确认」：返回按钮要确认，是因为那一下会丢掉整局；
 * 这里的代价只是弹一个随时能关掉的面板，再加一道确认就是纯粹的摩擦。
 */

import Phaser from 'phaser';

import { COLORS } from '../config';
import { FONT_SANS, toCss } from './theme';

const TOP = 18;
const H = 40;
const W = 48;
const LEFT = 16;

/** 与 BackButton 同层：盖在场景之上、所有浮层之下 */
const DEPTH = 460;

export class TutorialButton {
  private readonly rect: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    /** 返回 true = 现在有浮层盖着，这一下不算数 */
    private readonly isBlocked: () => boolean,
    private readonly onTap: () => void,
  ) {
    this.rect = scene.add
      .rectangle(LEFT, TOP, W, H, 0x111820, 0.95)
      .setOrigin(0, 0)
      .setStrokeStyle(1, 0x33454f, 0.9)
      .setDepth(DEPTH)
      .setInteractive({ useHandCursor: true });

    this.label = scene.add
      .text(LEFT + W / 2, TOP + H / 2, '?', {
        fontFamily: FONT_SANS,
        fontSize: '20px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5)
      .setDepth(DEPTH + 1);

    this.rect.on('pointerdown', () => {
      if (this.isBlocked()) return;
      this.onTap();
    });
    this.rect.on('pointerover', () => this.rect.setStrokeStyle(1, 0x4a606e, 1));
    this.rect.on('pointerout', () => this.rect.setStrokeStyle(1, 0x33454f, 0.9));
  }

  /**
   * 命中区判定。场景用它把这一下从热点点击里摘出去 ——
   * Phaser 的对象输入不看深度，不挡住的话，教学按钮底下压着的热点
   * （集装箱内部的「通风口（回去）」从 y=62 起）会跟着一起被点到。
   */
  hitTest(x: number, y: number): boolean {
    return this.rect.getBounds().contains(x, y);
  }

  /** 仅供开发钩子：按钮的中心点。 */
  devState(): { x: number; y: number } {
    return { x: Math.round(LEFT + W / 2), y: Math.round(TOP + H / 2) };
  }
}
