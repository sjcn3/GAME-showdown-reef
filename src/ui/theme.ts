import Phaser from 'phaser';

import { COLORS } from '../config';

/** 中文衬线：正文 / 文档 / 标题 */
export const FONT_SERIF = '"Songti SC", "SimSun", "Noto Serif CJK SC", "Source Han Serif SC", serif';
/** 中文无衬线：UI 标签 */
export const FONT_SANS = '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif';

export function toCss(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export interface ButtonOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fontSize?: number;
  readonly fill?: number;
  readonly hover?: number;
  readonly stroke?: number;
  readonly textColor?: number;
  readonly font?: string;
}

export interface Button {
  readonly rect: Phaser.GameObjects.Rectangle;
  readonly label: Phaser.GameObjects.Text;
  setLabel(text: string): void;
  /** 重新套用配色（用于选中态） */
  setActive(active: boolean): void;
}

export function makeButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  onClick: () => void,
  options: ButtonOptions = {},
): Button {
  const width = options.width ?? 320;
  const height = options.height ?? 64;
  const fill = options.fill ?? 0x151d22;
  const hover = options.hover ?? 0x233039;
  const stroke = options.stroke ?? 0x33454f;
  const font = options.font ?? FONT_SERIF;

  const rect = scene.add
    .rectangle(x, y, width, height, fill, 1)
    .setStrokeStyle(1, stroke)
    .setInteractive({ useHandCursor: true });

  const label = scene.add
    .text(x, y, text, {
      fontFamily: font,
      fontSize: `${options.fontSize ?? 22}px`,
      color: toCss(options.textColor ?? COLORS.ink),
      align: 'center',
    })
    .setOrigin(0.5);

  let active = false;
  const paint = () => rect.setFillStyle(active ? 0x2c3d47 : fill);

  rect.on('pointerover', () => rect.setFillStyle(active ? 0x35505c : hover));
  rect.on('pointerout', paint);
  rect.on('pointerdown', onClick);

  return {
    rect,
    label,
    setLabel: (t: string) => label.setText(t),
    setActive: (a: boolean) => {
      active = a;
      paint();
    },
  };
}

/** 章节卡 / 结局页共用的暗底 + 细横线 */
export function drawRule(scene: Phaser.Scene, y: number, width = 620): void {
  const g = scene.add.graphics();
  g.lineStyle(1, 0x33454f, 0.9);
  g.lineBetween((scene.scale.width - width) / 2, y, (scene.scale.width + width) / 2, y);
}
