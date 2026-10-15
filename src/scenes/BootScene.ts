import Phaser from 'phaser';

import { preloadSfx } from '../core/Sfx';
import { CORNER_MARK_KEY, CORNER_MARK_URL } from '../ui/CornerMark';

/**
 * 启动场景。
 *
 * 画面仍以程序化图形为主（见 `src/art/`），全项目唯一的位图是标题页右下角
 * 那枚「中国反走私」标识 —— 里面的标准字形没法用 Graphics 画。它的来源、
 * 处理过程和尺寸决策记在 `src/ui/CornerMark.ts` 里。
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // TODO(P5): 加载 public/assets 下的场景图 / 道具图标 / 文档内页
    // 音效只加载 SFX_FILES 里登记过的项 —— 清单为空时一个请求都不发，
    // 所以 P0~P4 不会因为缺素材冒出一堆 404。
    preloadSfx(this);

    // 标识是全项目唯一要预载的图：248×256、66 KB，而标题页第一帧就要用它，
    // 留到 TitleScene 里再 load 会先闪一下空白。
    this.load.image(CORNER_MARK_KEY, CORNER_MARK_URL);
  }

  create(): void {
    this.scene.start('Prologue');
  }
}
