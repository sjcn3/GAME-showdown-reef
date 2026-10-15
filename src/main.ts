import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from './config';
import { DEBUG_PANEL_OPEN } from './debugPanel';
import { installDevHook } from './dev';
import { BootScene } from './scenes/BootScene';
import { PrologueScene } from './scenes/PrologueScene';
import { TitleScene } from './scenes/TitleScene';
import { ExploreScene } from './scenes/ExploreScene';
import { ConfrontationScene } from './scenes/ConfrontationScene';
import { DebugScene } from './scenes/DebugScene';
import { GalleryScene } from './scenes/GalleryScene';
import { EndingScene } from './scenes/EndingScene';

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: COLORS.bg,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: true,
    roundPixels: false,
  },
  scene: [
    BootScene,
    PrologueScene,
    TitleScene,
    ExploreScene,
    ConfrontationScene,
    // 调试面板：关掉时连场景都不注册（开关在 src/debugPanel.ts 一行）。
    // 场景类仍然会被打进 bundle —— Phaser 的 Scene 是带副作用的类，
    // 不能指望 Rollup 因为"数组里没有它"就把它抖掉；
    // 关掉的实际收益是"关卡里没有任何路径能进到它"，不是那几 KB。
    ...(DEBUG_PANEL_OPEN ? [DebugScene] : []),
    GalleryScene,
    EndingScene,
  ],
};

const game = new Phaser.Game(config);

// 开发期钩子：带 ?dev=1 时才挂 window.__anJiao（见 src/dev.ts）
installDevHook(game, (sceneId) => {
  // 别先 stop 再 start 同一个 key：同一个 tick 里做这两件事，
  // Phaser 的场景队列会把它落成"停掉就不再起来"（实测 goto 之后 active=[]）。
  // 但别的场景（序幕 / 标题）必须先停 —— 全新加载页面时序幕还活着，
  // 它的 pointerdown 会把脚本的点击抢去开标题页。
  for (const s of game.scene.getScenes(true)) {
    if (s.scene.key !== 'Explore') s.scene.stop();
  }
  game.scene.start('Explore', { sceneId });
});

game.events.once(Phaser.Core.Events.READY, () => {
  document.getElementById('boot-hint')?.classList.add('gone');
});

export default game;
