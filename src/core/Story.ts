/**
 * 剧情数据结构 —— 数据驱动的点击场景（设计文档 11.2）
 *
 * 本文件保持**纯类型 + 纯函数**，不依赖 Phaser，
 * 这样热点分支、条件判定都能脱离渲染单测。
 * 解释器（把 Effect 变成画面与状态变化）在 scenes/ExploreScene.ts。
 */

import type { ItemId } from '../data/items';
import type { Flag, GameState } from './GameState';

/** 可阅读的文档内页 */
export type DocId = 'ship_log' | 'manifest' | 'list_fragment' | 'badge_back' | 'old_book';

/** 热点命中区：[x, y, w, h]，场景逻辑坐标（720×1280 全屏） */
export type Rect = readonly [x: number, y: number, w: number, h: number];

/** 判定上下文 */
export interface Ctx {
  readonly state: GameState;
  /** 玩家当前「手持」（在道具栏选中）的道具；无选中则为 null */
  readonly held: ItemId | null;
}

/** 一个可执行的效果。解释器按顺序执行，say / openDoc 会阻塞到玩家点掉。 */
export type Effect =
  /** 旁白或对白。who 省略 = 旁白 */
  | { readonly t: 'say'; readonly who?: string; readonly lines: readonly string[] }
  /** 获得道具（已在身上则静默忽略） */
  | { readonly t: 'give'; readonly item: ItemId }
  /** 置标记位 */
  | { readonly t: 'flag'; readonly flag: Flag }
  /** 打开文档阅读浮层 */
  | { readonly t: 'openDoc'; readonly doc: DocId }
  /** 闪回（黑白短暂插入，不可跳过） */
  | { readonly t: 'flashback'; readonly lines: readonly string[] }
  /** 切到另一个探索场景 */
  | { readonly t: 'goto'; readonly scene: string }
  /** 顶部一句话提示，自动消失（emphasis = 居中强调样式） */
  | { readonly t: 'toast'; readonly text: string; readonly emphasis?: boolean }
  /** 弹章节卡（淡入 → 停留 → 淡出，可点击跳过） */
  | { readonly t: 'chapterCard'; readonly chapter: number }
  /**
   * 推进到下一章。
   * 本阶段收集不完整时：**第一次点只弹提示、不推进**；再点一次才真的走。
   * 这套「提示一次」的策略归引擎管，数据层只声明意图（设计文档 9.3）。
   */
  | {
      readonly t: 'advanceChapter';
      /** 正在收尾的章节（0-based） */
      readonly from: number;
      /** 要进入的章节（0-based） */
      readonly to: number;
      /** 收尾台词；who 省略 = 旁白 */
      readonly who?: string;
      readonly lines: readonly string[];
      readonly hint?: string;
    }
  /** 直接进结局 */
  | { readonly t: 'ending'; readonly fumbleEpilogue?: boolean }
  /**
   * 进入第三章的交互式对峙（三个回合，玩家从道具栏选一件牌出示）。
   * 回合顺序与判定都在 core/EndingResolver.ts，台词在 data/confrontation.ts，
   * 这里只是一个「切到对峙」的开关。
   */
  | { readonly t: 'confrontation' }
  /**
   * 「要不要再找找？」闸门（设计文档 9.3）。
   * 指定章节收集不全 → **第一次点只弹提示、不执行 then**；再点一次才执行。
   * 用于「开锁 / 进门」这类不是章节推进、但同样该拦一下的地方
   * （第二章走廊那扇底舱门就是）。
   */
  | {
      readonly t: 'searchAgain';
      /** 检查哪一章的收集完整度（0-based） */
      readonly chapter: number;
      readonly hint?: string;
      readonly then: readonly Effect[];
    }
  /**
   * 密码盘（第二章保险柜）。
   * 玩家自己拨号：输对走 success，输错**不关闭面板**、只回一句 wrongText 再清空重来。
   * 面板本身不判定「该不该知道密码」——那是日志与旧书两条线索的事。
   */
  | {
      readonly t: 'password';
      readonly title: string;
      readonly answer: string;
      readonly wrongText: string;
      readonly success: readonly Effect[];
    };

/**
 * 一个热点分支。按数组顺序匹配，**第一个满足条件的生效**。
 * 用条件（而非「一次性」标记）表达状态，判定结果完全由 GameState 决定，
 * 因此存档 / 重玩 / 单测都不需要额外记录「点过几次」。
 */
export interface HotspotBranch {
  /** 全部满足才选中该分支；省略 = 恒真（通常放最后作兜底） */
  readonly when?: (c: Ctx) => boolean;
  /** 必须手持该道具才选中该分支（选中道具后点热点 = 使用道具） */
  readonly needs?: ItemId;
  readonly effects: readonly Effect[];
}

export interface Hotspot {
  readonly id: string;
  /** 命中区 */
  readonly rect: Rect;
  /** 调试用名称，不显示给玩家（锈湖式无高亮提示，设计文档 9.1） */
  readonly label: string;
  readonly branches: readonly HotspotBranch[];
}

/** 场景之间的移动（点箭头 / 点门） */
export interface ExitDef {
  readonly rect: Rect;
  readonly to: string;
  readonly label: string;
}

export interface SceneDef {
  readonly id: string;
  /** 所属章节（0-based）—— 用于「要不要再找找？」的收集完整度判定 */
  readonly chapter: number;
  readonly title: string;
  /** 正式美术资源键（public/assets/scenes/…）；为空时用占位绘制 */
  readonly art?: string;
  /**
   * 占位美术的键，由渲染层（ExploreScene）自己查表解析。
   * 数据层刻意不引用 art/ 下的模块，这样章节数据能脱离 Phaser 单测。
   * P5 换成正式美术时改为读 `art`。
   */
  readonly paintKey: string;
  /** 首次进入时播放（含进入文本） */
  readonly onEnter?: readonly Effect[];
  readonly hotspots: readonly Hotspot[];
  readonly exits?: readonly ExitDef[];
}

// ── 纯函数工具 ────────────────────────────────────────────

/** 热点命中测试（点是否落在矩形内） */
export function hits(rect: Rect, x: number, y: number): boolean {
  const [rx, ry, rw, rh] = rect;
  return x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;
}

/** 按顺序找出第一个满足条件的分支下标；都不满足返回 -1 */
export function pickBranch(branches: readonly HotspotBranch[], c: Ctx): number {
  for (let i = 0; i < branches.length; i++) {
    const b = branches[i]!;
    if (b.needs !== undefined && c.held !== b.needs) continue;
    if (b.needs === undefined && c.held !== null) {
      // 手持道具点一个不需要道具的热点 = 什么都没发生，交给兜底分支
      // （避免「拿着撬棍点老周」反而触发剧情）
      continue;
    }
    if (b.when && !b.when(c)) continue;
    return i;
  }
  return -1;
}

/**
 * 深度展开效果列表：密码盘的 success、找找闸门的 then 里也可能发道具，
 * 只扫最外层会漏（曾把第二章的警号牌与名单残页漏掉，被单测逮住）。
 * 返回数组而不是生成器，纯粹是为了调用处能直接用 .some/.filter。
 */
export function walkEffects(effects: readonly Effect[]): Effect[] {
  const out: Effect[] = [];
  for (const e of effects) {
    out.push(e);
    if (e.t === 'password') out.push(...walkEffects(e.success));
    else if (e.t === 'searchAgain') out.push(...walkEffects(e.then));
  }
  return out;
}

/** 收集某个场景定义里所有会发放的道具（用于「要不要再找找？」判定） */
export function collectiblesOf(scenes: readonly SceneDef[], chapter: number): ItemId[] {
  const out: ItemId[] = [];
  for (const s of scenes) {
    if (s.chapter !== chapter) continue;
    const all = walkEffects([
      ...(s.onEnter ?? []),
      ...s.hotspots.flatMap((h) => h.branches.flatMap((b) => b.effects)),
    ]);
    for (const e of all) {
      if (e.t === 'give' && !out.includes(e.item)) out.push(e.item);
    }
  }
  return out;
}

/** 本章是否已全部收集完毕（决定章节能不能推进） */
export function chapterComplete(scenes: readonly SceneDef[], chapter: number, state: GameState): boolean {
  return collectiblesOf(scenes, chapter).every((id) => state.has(id));
}
