/**
 * 环境动效层（第 2 组优化 B1 / B2）
 *
 * 场景美术是一张**画死在 create() 里的静态图**（`placeholders.ts` 把整个场景
 * 一次性画进一个 Graphics 就不再动它）。要让它"活着"，不能每帧重画整张图 ——
 * 那等于把 900 多条图元每秒重建 60 次。
 *
 * 这里所有的层都遵守同一条规矩：**图形只在建层时画一次，之后只动 transform /
 * alpha**。雨水靠"周期性位移"做到无缝循环，灯光和水光靠 alpha 呼吸，尘埃靠
 * 两个错相的长 tween 慢慢飘。每层都是独立的 Graphics，谁出问题都不会牵连别的。
 *
 * 所有坐标都是**游戏坐标**（720×1280 的舞台），调用方给的是绝对位置。
 */

import type Phaser from 'phaser';

type G = Phaser.GameObjects.Graphics;

function line(g: G, x1: number, y1: number, x2: number, y2: number, color: number, width = 1, alpha = 1): void {
  g.lineStyle(width, color, alpha);
  g.lineBetween(x1, y1, x2, y2);
}

/** 深度：场景静态图在 0，动效层压在它上面、但必须在所有 UI 之下（UI 从 400 起） */
export const AMBIENT_DEPTH = 20;

// ── B1 · 会下的雨 ────────────────────────────────────────

export interface RainOptions {
  /** 雨区（游戏坐标）。雨只在这个矩形里下，但**不会**被裁掉 —— 见下面 slot 的说明 */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly count?: number;
  readonly color?: number;
  readonly minAlpha?: number;
  readonly alphaStep?: number;
  /** 雨丝的水平偏移，决定"斜"多少 */
  readonly slant?: number;
  readonly lenMin?: number;
  readonly lenMax?: number;
  /** 雨丝走完雨区高度要多少毫秒 */
  readonly fallMs?: number;
  /** 换一个数就换一套分布；同一个场景每次进都要一样，所以不要传随机数 */
  readonly seed?: number;
  readonly depth?: number;
}

/**
 * 会下的雨。
 *
 * 做法是 **TileSprite 滚**：先把一屏雨丝按「竖直周期 = h」画进一张离屏贴图
 * （每条雨丝在 `y0` 和 `y0 - h` 上各画一遍，所以贴图上下边天然无缝），再让
 * `tilePositionY` 从 0 匀速走到 h 然后循环。TileSprite 只画自己那个矩形里的部分，
 * **自带裁剪** —— 这正好是需要的：雨只在雨区里下，不会溢到别处去。
 *
 * 为什么不用「Graphics + 位移」：
 *   1. Graphics 不裁剪，位移本身还会把内容整体推下去一个周期 —— 雨区设成 0~600，
 *      实际雨丝会一路画到 y≈1260，盖到车内的仪表台和 HUD 上；
 *   2. 想给它套几何遮罩也走不通：`createGeometryMask()` 在 WebGL 下**没有实现**，
 *      Phaser 4 会直接在控制台报 "This method is not supported in WebGL. Create a
 *      Mask filter instead."；而 Mask filter 是「跟着被过滤对象一起动」的，
 *      与这里要的「钉死在屏幕上的雨区」正好相反；
 *   3. TileSprite 就一个 quad，比每帧重建几百条线段便宜得多。
 *
 * 水平方向不做周期：贴图宽度 == 雨区宽度，横向刚好铺满一张，看不到重复接缝。
 * 雨丝的 x 刻意收在 `[0, w-slant)`，斜出去也不会被贴图右边界切掉。
 *
 * 贴图按参数签名缓存在全局 TextureManager 里，同一场景反复进出只会生成一次。
 */
export function addRain(scene: Phaser.Scene, o: RainOptions): Phaser.GameObjects.TileSprite {
  const count = o.count ?? 170;
  const color = o.color ?? 0x9fb0bb;
  const minAlpha = o.minAlpha ?? 0.04;
  const alphaStep = o.alphaStep ?? 0.025;
  const slant = o.slant ?? 13;
  const lenMin = o.lenMin ?? 30;
  const lenMax = o.lenMax ?? 70;
  const seed = o.seed ?? 0;

  const key = `rain-${o.w}x${o.h}-${count}-${color}-${minAlpha}-${alphaStep}-${slant}-${lenMin}-${lenMax}-${seed}`;
  if (!scene.textures.exists(key)) {
    const g = scene.make.graphics({}, false);
    for (let i = 0; i < count; i++) {
      const x = (i * 149 + seed * 37) % (o.w - slant - 1);
      const y0 = (i * 61 + seed * 23) % o.h;
      const len = lenMin + ((i * 19) % (lenMax - lenMin));
      const a = minAlpha + ((i % 4) * alphaStep);
      // 本周期 + 上一周期：贴图上下边因此无缝
      line(g, x, y0, x + slant, y0 + len, color, 1, a);
      line(g, x, y0 - o.h, x + slant, y0 - o.h + len, color, 1, a);
    }
    g.generateTexture(key, o.w, o.h);
    g.destroy();
  }

  const rain = scene.add
    .tileSprite(o.x, o.y, o.w, o.h, key)
    .setOrigin(0, 0)
    .setDepth(o.depth ?? AMBIENT_DEPTH);
  scene.tweens.add({
    targets: rain,
    tilePositionY: o.h,
    duration: o.fallMs ?? 1900,
    repeat: -1,
    ease: 'Linear',
  });
  return rain;
}

// ── B2 · 会呼吸的灯 ──────────────────────────────────────

export interface LampSpec {
  readonly x: number;
  readonly y: number;
  /** 光晕外半径 */
  readonly r: number;
  readonly color: number;
  /** 呼吸到的最亮 alpha */
  readonly alpha?: number;
  readonly periodMs?: number;
  readonly rings?: number;
  /**
   * 接触不良：不按正弦呼吸，改成不规则跳变。
   * 用固定序列而不是 Math.random，同一盏灯每次进来抖得一样，
   * 截图对比时才不会每张都不一样。
   */
  readonly flicker?: boolean;
}

/**
 * 给一组灯各加一层"会呼吸的光晕"。
 *
 * 底层静态图里那盏灯本身不画光晕（或者只画很淡的一层），这里叠一层会动的上去 ——
 * 底图不动、光会动，看起来就是灯在工作，而且改动只在动效层，静态构图一点没碰。
 *
 * 光晕用同色同心圆叠出来（Phaser 的 Graphics 没有渐变填充，单张圆片的圆周是硬的、
 * 两两重叠还会叠出可见的"透镜"弧线）。
 */
export function addLamps(scene: Phaser.Scene, lamps: readonly LampSpec[], depth = AMBIENT_DEPTH): G[] {
  return lamps.map((lamp) => {
    const rings = lamp.rings ?? 9;
    const alpha = lamp.alpha ?? 0.16;
    const g = scene.add.graphics().setDepth(depth);
    // 由外向内叠，越里面叠得越多 —— 天然的中心亮、边缘暗
    for (let i = rings; i >= 1; i--) {
      g.fillStyle(lamp.color, alpha / rings);
      g.fillCircle(lamp.x, lamp.y, (lamp.r * i) / rings);
    }
    g.setAlpha(lamp.flicker ? 0.85 : 0.6);

    if (lamp.flicker) {
      // 固定序列的抖动：大部分时间接近全亮，偶尔掉一下
      const seq = [0.35, 0.9, 0.55, 1, 0.7, 1, 0.25, 0.95, 0.8, 1, 0.5, 1];
      let i = 0;
      scene.time.addEvent({
        delay: 110,
        loop: true,
        callback: () => {
          g.setAlpha(seq[i % seq.length]!);
          i += 1;
        },
      });
    } else {
      scene.tweens.add({
        targets: g,
        alpha: 1,
        duration: lamp.periodMs ?? 2400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
    return g;
  });
}

// ── B2 · 会晃的水面 ──────────────────────────────────────

export interface ShimmerBand {
  readonly y: number;
  readonly x: number;
  readonly w: number;
  readonly alpha?: number;
  readonly thickness?: number;
}

/**
 * 水面反光：几道横向亮线，分三层错相呼吸 + 极慢的左右漂移。
 *
 * 只有一层的话整片水会同时亮同时暗，像在闪灯；分三层各走各的周期，
 * 才是"水面一直在动但每一下都不一样"。
 */
export function addShimmer(
  scene: Phaser.Scene,
  bands: readonly ShimmerBand[],
  color = 0x4d7f96,
  depth = AMBIENT_DEPTH,
): G[] {
  const layers: G[] = [];
  for (let layer = 0; layer < 3; layer++) {
    const g = scene.add.graphics().setDepth(depth + layer);
    let drew = false;
    bands.forEach((b, i) => {
      if (i % 3 !== layer) return;
      drew = true;
      line(g, b.x, b.y, b.x + b.w, b.y, color, b.thickness ?? 2, b.alpha ?? 0.5);
    });
    if (!drew) {
      g.destroy();
      continue;
    }
    g.setAlpha(0.45);
    scene.tweens.add({
      targets: g,
      alpha: 1,
      duration: 2100 + layer * 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    scene.tweens.add({
      targets: g,
      x: layer % 2 === 0 ? 11 : -11,
      duration: 5200 + layer * 1700,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    layers.push(g);
  }
  return layers;
}

// ── B2 · 光柱里的尘埃 ────────────────────────────────────

export interface MotesOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly count?: number;
  readonly color?: number;
  readonly size?: number;
  readonly alpha?: number;
  readonly seed?: number;
}

/**
 * 光柱里慢慢飘的尘埃。
 *
 * 静止的尘埃点看起来就是噪点，必须动。这里用两个互质的长周期分别驱动 x 和 y
 * （5100ms / 7300ms），两个正弦叠出来的轨迹不会走成一个闭环，看起来就是各飘各的。
 *
 * **x 和 y 必须由两个不同的 tween 驱动**：同一个属性挂两个 tween，后一个会覆盖
 * 前一个，画面会变成只在一个方向上来回蹭。
 */
export function addMotes(scene: Phaser.Scene, o: MotesOptions): G {
  const count = o.count ?? 26;
  const color = o.color ?? 0xa9bcc6;
  const size = o.size ?? 1.4;
  const seed = o.seed ?? 0;

  const g = scene.add.graphics().setDepth(AMBIENT_DEPTH + 4);
  for (let i = 0; i < count; i++) {
    const x = o.x + ((i * 97 + seed * 13) % o.w);
    const y = o.y + ((i * 173 + seed * 29) % o.h);
    g.fillStyle(color, (o.alpha ?? 0.3) * (0.5 + ((i % 5) * 0.125)));
    g.fillCircle(x, y, size * (0.7 + ((i % 3) * 0.3)));
  }
  scene.tweens.add({
    targets: g,
    y: -24,
    duration: 5100,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: g,
    x: 16,
    duration: 7300,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return g;
}

// ── B2 · 海面/舱底的雾 ───────────────────────────────────

export interface MistOptions {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly count?: number;
  readonly color?: number;
  /** 最亮时的整体 alpha。雾是"看得见但说不出在哪"的东西，这个值必须小 */
  readonly alpha?: number;
  readonly seed?: number;
  readonly driftMs?: number;
}

/**
 * 贴着地面/海面慢慢漂的雾。
 *
 * 和 `addLamps` 一样用同色同心圆叠（Graphics 没有渐变填充），区别是**圆要大得多、
 * alpha 要小得多**：每团雾的半径是雨区短边的 16%~30%，整体 alpha 压在 0.05 上下。
 * 单团雾的边缘仍然硬，但叠了 6 圈、又只有 5% 的 alpha，硬边就散在一个很大的范围里，
 * 看起来是"那边亮一点"，而不是"那儿有个圆"。
 *
 * 漂移周期给到 17 秒 —— 雾要是和尘埃一个速度，就变成大号的尘埃了。
 */
export function addMist(scene: Phaser.Scene, o: MistOptions): G {
  const count = o.count ?? 5;
  const color = o.color ?? 0x9fb8c8;
  const alpha = o.alpha ?? 0.05;
  const seed = o.seed ?? 0;
  const rings = 6;

  const g = scene.add.graphics().setDepth(AMBIENT_DEPTH + 2);
  for (let i = 0; i < count; i++) {
    const cx = o.x + ((i * 211 + seed * 47) % o.w);
    const cy = o.y + ((i * 137 + seed * 31) % o.h);
    const r = Math.min(o.w, o.h) * (0.16 + ((i % 3) * 0.07));
    for (let k = rings; k >= 1; k--) {
      g.fillStyle(color, alpha / rings);
      g.fillCircle(cx, cy, (r * k) / rings);
    }
  }
  g.setAlpha(0.6);
  scene.tweens.add({
    targets: g,
    alpha: 1,
    duration: 9000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: g,
    x: 34,
    duration: o.driftMs ?? 17000,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return g;
}

// ── B2 · 烟头上的那缕烟 ──────────────────────────────────

export interface SmokeOptions {
  readonly x: number;
  readonly y: number;
  readonly color?: number;
  readonly alpha?: number;
  /** 这缕烟总高多少 */
  readonly rise?: number;
  readonly periodMs?: number;
}

/**
 * 烟头飘起来的一缕烟。
 *
 * 静态图里这缕烟是两个椭圆（`fillEllipse(676,992,26,12)` 之类），贴在人脚边不动 ——
 * 一根点着的烟不冒烟，是这张图里最说不过去的地方。
 *
 * 这里画一串越往上越大越淡的圆当烟柱，然后**上下慢慢荡**（不是匀速上升）。
 * 匀速上升的循环每转一圈都要从终点跳回起点，那一下在 12% 的 alpha 下也看得出来；
 * 荡起来就永远没有"接缝"。
 */
export function addSmoke(scene: Phaser.Scene, o: SmokeOptions): G {
  const color = o.color ?? 0xd8d4c4;
  const alpha = o.alpha ?? 0.12;
  const rise = o.rise ?? 34;

  const g = scene.add.graphics().setDepth(AMBIENT_DEPTH + 3);
  for (let i = 0; i < 5; i++) {
    const t = i / 4;
    g.fillStyle(color, alpha * (1 - t * 0.8));
    g.fillCircle(o.x + Math.sin(t * 3.1) * 9, o.y - t * rise, 3 + t * 5);
  }
  g.setAlpha(0.4);
  scene.tweens.add({
    targets: g,
    alpha: 1,
    duration: 1400,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: g,
    y: -rise * 0.55,
    duration: o.periodMs ?? 4300,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  return g;
}
