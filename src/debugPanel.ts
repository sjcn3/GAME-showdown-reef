/**
 * 调试面板（结局判定表）的开关。
 *
 * ─────────────────────────────────────────────────────────────
 *  要打开或关闭调试面板，**只改下面 `DEBUG_PANEL` 这一行**。
 * ─────────────────────────────────────────────────────────────
 *
 * 面板本身在 `src/scenes/DebugScene.ts`（一个直接操作 gameState、
 * 实时显示判定结果的画面）。**这个文件管的是它的入口与注册**，
 * 也就是"玩家在标题页上会不会看到它、引擎认不认这个场景"：
 *
 *   'open'   打开 —— 标题页第三格是「判定表 · 调试面板」，点进去是 DebugScene；
 *                    DebugScene 注册进 Phaser。
 *   'closed' 关闭 —— 标题页不画这一格，DebugScene 也不注册。
 *                    关卡里没有任何路径能进到它，正式产物上不留痕迹。
 *
 * ⚠️ 这是**编译期常量**，不是运行时开关：改完必须重新 `npm run build`
 *    （或让 dev server 重新编译）才会进产物。好处是关掉之后，
 *    `?dev=1` 也调不出它来 —— 交件前想知道"评委看到的是不是干净的"，
 *    就把这行改成 'closed' 重新构建一次，而不是靠记性。
 *
 * ⚠️ 关掉时**只少画那一格，前两个按钮的位置一个像素都不动**。
 *    开关不允许改变正式界面的版面 —— 否则"关掉调试面板"会顺带挪动
 *    「开始调查」和「结局图鉴」，那就不再是同一个版面了。
 */

import { COLORS } from './config';

/**
 * ★★★ 打开 / 关闭调试面板：改这一个字符串 ★★★
 *
 * 末尾的 `as 'open' | 'closed'` 不是多余的：如果只写
 *   `export const DEBUG_PANEL: 'open' | 'closed' = 'closed';`
 * TypeScript 的控制流分析会把它的**实际类型收窄成字面量 `'closed'`**，
 * 下面那句 `DEBUG_PANEL === 'open'` 就会报 TS2367
 * 「'"closed"' 和 '"open"' 没有重叠，这个比较多半是写错了」——
 * 也就是说，**开关一旦真的改成 'closed' 就编译不过**。
 * 断言成联合类型之后，初始化表达式的类型本身就是联合，收窄无从下手。
 */
export const DEBUG_PANEL = 'open' as 'open' | 'closed';

/** 调试面板这一版露不露出来（下面全部由它派生，不要再手写第二处判断） */
export const DEBUG_PANEL_OPEN: boolean = DEBUG_PANEL === 'open';

/**
 * 标题页上那一格。
 *
 * 位置和尺寸都放在这里而不是 `TitleScene.ts` 里，是为了让"关掉调试面板"
 * 真的只需要看这一个文件 —— `TitleScene` 只负责"开就画、关就跳过"。
 */
export const DEBUG_ENTRY = {
  /** 点了之后切到哪个场景（同时也是 `main.ts` 里注册的那个 key） */
  sceneKey: 'Debug',
  label: '判定表 · 调试面板',
  /** 标题页第三格的中心 y；前两格在 884 / 980，三格等距 */
  y: 1076,
  width: 380,
  height: 72,
  fontSize: 19,
  textColor: COLORS.inkDim,
} as const;
