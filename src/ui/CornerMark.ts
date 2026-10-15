import Phaser from 'phaser';

import markUrl from '../assets/logo-fan-zousi.png';
import { GAME_HEIGHT, GAME_WIDTH } from '../config';

/**
 * 标题页右下角的「中国反走私」标识。
 *
 * ── 为什么这里破例用了位图 ──
 * 全项目其余画面都是 `src/art/` 里用 Graphics 画出来的（场景、道具图标、
 * 结局插画、人物对照），一张外部图片都没有。这里破例，是因为标识里的
 * 「中国反走私」五个字是标准字形 —— 没有对应的矢量路径可以画，
 * 硬凑一套近似字形只会得到一个"像但不是"的东西，比不用还糟。
 *
 * ── 为什么源图不能直接用 ──
 * `docs/截图/logo.jpg` 是白底 JPEG，两处都不合这一页：
 *   1. 白底在夜景上就是贴上去的一块白纸 → 去白底做透明
 *   2. 原图的字是**黑的**，而这一页底部是 #0e0708 —— 黑字等于隐形 →
 *      字换成浅墨。红盾保留：官方标识放在深色背景上时保留主色、把字转浅，
 *      本来就是常规做法，不算篡改标识。
 * 两步都在 `tools/_logo.py` 里做完，产物 `src/assets/logo-fan-zousi.png`。
 *
 * ── 尺寸 ──
 * 源图 339×344，裁掉白边后是 248×256（比例 0.969），这里按高度 116 显示（宽约 112）。
 *
 * 116 不是随手定的，是被那五个字逼出来的：字高约占整图高度的 22%，
 * 116 折到 390px 宽的屏上，每个字约 14 个 CSS 像素。实测过另外两档：
 *   - 84：每个字约 9px，「走」「私」这种笔画多的字直接糊成一道灰，
 *         远看是一枚盾牌底下拖着一条脏线，比不放还难看
 *   - 132：字清楚了，但整块红盖过版面，顶边还撞上上面「判定表·调试面板」那格
 * 116 是"字能认出来"和"不抢版面"之间还剩的那点余地。
 */

/** 纹理键。`BootScene.preload()` 按它加载，这里按它取用 */
export const CORNER_MARK_KEY = 'corner-mark';

/** 构建后的图片 URL（`vite.config.ts` 里 `base: './'`，所以是相对路径） */
export const CORNER_MARK_URL = markUrl;

/** 处理后的图是 248×256，宽高比固定 */
const RATIO = 248 / 256;

/** 显示高度（逻辑像素） */
const HEIGHT = 116;

/**
 * 右边距 / 底边距。
 *
 * 不跟底部那行「'钱江杯'…作品」共用基线：那行是 16px 居中，
 * 标识是 116px 的图，两者对齐反而像没对齐。角标按自己的留白锚在角上，
 * 横向也够开 —— 那行字最宽到 x≈488，标识从 x≈552 才开始。
 *
 * 底边距给 40 还有一层：上面那格「判定表·调试面板」在 y≈1076，
 * 标识顶边落在 1124，中间留出 20 多像素，开着调试面板时不会挤成一团。
 * 顺带一提，这个位置和左下角那枚铜徽（y 1126~1186）顶边几乎齐平，
 * 底部这一条于是读成"左铜徽 · 中说明 · 右标识"。
 */
const MARGIN_RIGHT = 56;
const MARGIN_BOTTOM = 40;

/**
 * 压一档不透明度。
 *
 * 纯红的标识放上去是全页最跳的颜色 —— 比标题还跳。0.86 之后它仍然是这一页
 * 唯一的红，但不再把视线从「暗礁」两个字上拽走。
 */
const ALPHA = 0.86;

export function addCornerMark(scene: Phaser.Scene): void {
  scene.add
    .image(GAME_WIDTH - MARGIN_RIGHT, GAME_HEIGHT - MARGIN_BOTTOM, CORNER_MARK_KEY)
    .setOrigin(1, 1)
    .setDisplaySize(HEIGHT * RATIO, HEIGHT)
    .setAlpha(ALPHA);
}
