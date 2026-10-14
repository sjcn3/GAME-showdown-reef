import Phaser from 'phaser';

import { preloadSfx } from '../core/Sfx';

/**
 * 启动场景。
 * P0 阶段没有外部美术资源，全部用程序化图形占位；
 * 正式美术接入后，这里改成 this.load.* 并保留进度条。
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
  }

  create(): void {
    this.scene.start('Prologue');
  }
}
