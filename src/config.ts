/**
 * 《暗礁》全局常量
 * 竖屏 9:16，逻辑分辨率 720×1280，按 FIT 缩放。
 */

export const GAME_WIDTH = 720;
export const GAME_HEIGHT = 1280;

/** 底部道具栏高度（逻辑像素） */
export const INVENTORY_HEIGHT = 176;

/** 场景可视区高度 = 总高 - 道具栏 */
export const STAGE_HEIGHT = GAME_HEIGHT - INVENTORY_HEIGHT;

/** 文档阅读浮层占屏宽比例 */
export const DOC_WIDTH_RATIO = 0.88;

/** 「要不要再找找？」提示自动消失时长（毫秒）。设计文档 9.3 */
export const SEARCH_AGAIN_HINT_MS = 4000;

/** 闪回时长（毫秒） */
export const FLASHBACK_MS = 1000;

export const COLORS = {
  bg: 0x0b1014,
  /** 黄昏（第一章） */
  dusk: 0x3a3128,
  /** 深夜（第二章） */
  night: 0x14202b,
  /** 雨夜（第三章） */
  rain: 0x0d1418,
  ink: 0xc8d2d8,
  inkDim: 0x6b7c88,
  accent: 0xc9a227,
  danger: 0x8c3b32,
  paper: 0xe8e2d4,
} as const;

/** localStorage 键名 */
export const SAVE_KEY = 'an-jiao:save:v1';
