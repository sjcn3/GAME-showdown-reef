/**
 * 每个场景挂哪些环境动效层（第 2 组 B1「雨是静止的」/ B2「环境动效」）。
 *
 * 甲：这一层原来是**没有**的 —— 七个场景各自往一张 Graphics 里画完就再也不动，
 * 雨丝是画上去的斜线、灯光是画上去的圆斑、水面是画上去的横条，
 * 整个游戏除了 UI 全是静物。这里按场景把动效层挂上去，
 * 静态图一个像素都不用改（只把和动效层重复的那几笔去掉，见各场景里的注释）。
 *
 * 表格里的坐标全部是**游戏坐标**（720×1104 的舞台），和 `placeholders.ts`
 * 用的是同一套 —— 画水面反光要知道水在哪、给灯加光晕要知道灯在哪，
 * 所以这些数字是照着静态图抄的，改静态图时要回来改这里。
 *
 * 每个场景的层数控制在 4~7 个：每层都只是一个 Graphics + 一两个 tween，
 * 不重画、不建粒子，代价可以忽略；但也没有必要给每个角落都挂一层。
 */

import type Phaser from 'phaser';

import { addLamps, addMist, addMotes, addRain, addShimmer, addSmoke } from './ambient';

type Builder = (scene: Phaser.Scene) => void;

const SCENE_AMBIENT: Readonly<Record<string, Builder>> = {
  // ── 场景 1 · 黄昏码头 ──
  // 海面（y 500~604）和左侧那摊积水（y 878~1014）各是一套反光：
  // 海面反的是西边的天光（暖），积水反的是码头灯（冷），两套颜色不能混用。
  dock_exterior: (s) => {
    addShimmer(
      s,
      [
        { x: 20, y: 520, w: 210, alpha: 0.55 },
        { x: 60, y: 546, w: 150, alpha: 0.4 },
        { x: 300, y: 566, w: 240, alpha: 0.5 },
        { x: 130, y: 588, w: 190, alpha: 0.3 },
      ],
      0x8a7430,
    );
    addShimmer(
      s,
      [
        { x: 70, y: 930, w: 170, alpha: 0.6 },
        { x: 110, y: 972, w: 120, alpha: 0.45 },
        { x: 56, y: 900, w: 200, alpha: 0.35 },
        { x: 140, y: 996, w: 110, alpha: 0.4 },
      ],
      0x4d7f96,
    );
    addMotes(s, { x: 0, y: 380, w: 720, h: 700, count: 34, alpha: 0.16, size: 1.6, seed: 1 });
    // 海面上贴着水皮的一层薄雾：黄昏、逆光，远处本来就该糊一点
    addMist(s, { x: 0, y: 470, w: 720, h: 130, count: 4, alpha: 0.05, seed: 11 });
    // 老周脚边那根薄荷烟（静态图的烟蒂在 626~682, 1002~1010；滤嘴在右端，
    // 所以烟从 630 上下的左端冒）
    addSmoke(s, { x: 630, y: 984 });
  },

  // ── 场景 2 · 集装箱内部 ──
  // 只有通风口那一柱天光（[[196,62],[236,208],[330,560],[236,560]]）里有尘埃，
  // 别处飘就和"封闭的箱子"这个前提打架了。
  container_interior: (s) => {
    addMotes(s, { x: 190, y: 60, w: 150, h: 500, count: 22, color: 0xd8d2c4, alpha: 0.34, size: 1.3, seed: 2 });
  },

  // ── 场景 3 · 船长室 ──
  captain_cabin: (s) => {
    addMotes(s, { x: 60, y: 120, w: 600, h: 700, count: 24, alpha: 0.14, size: 1.4, seed: 3 });
  },

  // ── 场景 4 · 走廊 ──
  // 三盏顶灯的坐标抄自静态图里的 `[[360,250,1],[200,130,0.6],[520,130,0.6]]`。
  // 中间那盏是主灯，规规矩矩地呼吸；两盏侧灯一盏接触不良、一盏慢半拍 ——
  // 三盏同步明灭看起来像有人在外面拉总闸。
  corridor: (s) => {
    addLamps(s, [
      { x: 360, y: 250, r: 130, color: 0xc9a227, alpha: 0.2, periodMs: 2600 },
      { x: 200, y: 130, r: 78, color: 0xc9a227, alpha: 0.16, flicker: true },
      { x: 520, y: 130, r: 78, color: 0xc9a227, alpha: 0.16, periodMs: 3300 },
    ]);
    addShimmer(
      s,
      [
        { x: 60, y: 1020, w: 200, alpha: 0.45 },
        { x: 250, y: 996, w: 220, alpha: 0.4 },
        { x: 380, y: 1054, w: 260, alpha: 0.4 },
        { x: 120, y: 1064, w: 180, alpha: 0.3 },
      ],
      0xc9a227,
    );
    addMotes(s, { x: 120, y: 200, w: 480, h: 700, count: 20, alpha: 0.13, seed: 4 });
  },

  // ── 场景 5 · 底舱 ──
  // 手电光柱里的尘埃是最值的一层：光柱本身是静态图里两块很淡的多边形，
  // 有了飘动的尘埃才读得出"这是一束光"，而不是墙上刷了两道浅色。
  bilge: (s) => {
    addMotes(s, { x: 180, y: 260, w: 400, h: 780, count: 30, color: 0xe8e2d4, alpha: 0.3, size: 1.5, seed: 5 });
    // 舱底常年积着的一层油气：比海面那层更低更暗，只铺在舱底那滩水上方
    addMist(s, { x: 40, y: 820, w: 640, h: 260, count: 4, color: 0x8fa6b4, alpha: 0.045, seed: 12 });
  },

  // ── 场景 8a · 仓库外（车内视角）──
  // 这里的雨只下在**挡风玻璃的可见区域**（y 0~600）：再往下就是雨刷
  // （y 812~874）和仪表台，雨丝画到那里就会压在雨刷前面 —— 车外的雨
  // 不可能出现在车内的雨刷前面。玻璃上那层不动的雨痕留在静态图里（那本来就
  // 是"贴在玻璃上"的，不该动），会动的是玻璃外面的雨。
  warehouse_approach: (s) => {
    addRain(s, {
      x: -60,
      y: 0,
      w: 840,
      h: 600,
      count: 150,
      slant: 11,
      minAlpha: 0.035,
      alphaStep: 0.022,
      lenMin: 26,
      lenMax: 60,
      fallMs: 1500,
      seed: 6,
    });
    // 门楣上那盏接触不良的灯：静态图里只留了灯管和灯下的亮斑，光晕在这里抖
    addLamps(s, [{ x: 400, y: 445, r: 95, color: 0xc9a227, alpha: 0.14, flicker: true }]);
    addShimmer(
      s,
      [
        { x: 20, y: 620, w: 120, alpha: 0.3 },
        { x: 300, y: 640, w: 180, alpha: 0.28 },
        { x: 200, y: 700, w: 160, alpha: 0.35 },
        { x: 380, y: 790, w: 140, alpha: 0.3 },
        { x: 120, y: 850, w: 100, alpha: 0.25 },
      ],
      0x4d7f96,
    );
  },

  // ── 场景 8b · 雨夜仓库（对峙）──
  // 全场最大的一场雨：静态图里原来那段 170 根的斜线已经删掉，全部搬到这里。
  warehouse_night: (s) => {
    addRain(s, { x: -60, y: 0, w: 840, h: 1104, count: 190, seed: 7, fallMs: 1700 });
    addShimmer(
      s,
      [
        { x: 520, y: 792, w: 160, alpha: 0.4 },
        { x: 240, y: 792, w: 320, alpha: 0.35 },
        { x: 96, y: 808, w: 180, alpha: 0.3 },
      ],
      0x4d7f96,
    );
    addMotes(s, { x: 60, y: 300, w: 600, h: 700, count: 24, alpha: 0.13, seed: 8 });
  },
};

/** 给当前场景挂上它的环境动效层。没有配的场景就是一个静态画面（不影响其它逻辑） */
export function addSceneAmbient(scene: Phaser.Scene, paintKey: string): void {
  SCENE_AMBIENT[paintKey]?.(scene);
}
