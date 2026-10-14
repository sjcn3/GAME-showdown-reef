/**
 * 道具类别配色。
 *
 * 从 InventoryBar 里抽出来，是因为证据列表要用同一套颜色 ——
 * 两处各写一份，早晚会出现"同一件东西在道具栏里是金色、在证据里是灰的"。
 */

import type { ItemKind } from '../data/items';

export const KIND_COLOR: Readonly<Record<ItemKind, number>> = {
  key: 0xc9a227,
  clue: 0x8fa6b4,
  tool: 0x9aa4a8,
  extra: 0x6b7c88,
};
