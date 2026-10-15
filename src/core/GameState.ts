/**
 * 游戏状态 —— 纯数据、可序列化。
 * 剧情逻辑与渲染完全分离（设计文档 11.2）。
 */

import type { ItemId } from '../data/items';
import {
  CONFRONTATION_ROUNDS,
  MAX_FUMBLES,
  countClues,
  countKeys,
  evaluatePresentation,
  resolveEnding,
  type ConfrontationRound,
  type PresentationResult,
  type ResolvedEnding,
} from './EndingResolver';

export type Flag =
  /** 第一章 · 已撬开通风口 */
  | 'vent_opened'
  /** 第一章 · 已撬开木箱堆 */
  | 'crates_opened'
  /** 第一章 · 已发现夹层切割痕迹 */
  | 'cut_mark_found'
  /** 第一章 · 已撬开暗格 */
  | 'cache_opened'
  /** 第一章 · 已从老周处听到第二章线索 */
  | 'zhou_talked'
  /** 第二章 · 保险柜已开 */
  | 'safe_opened'
  /** 第二章 · 已读过密码提示 */
  | 'password_hint_read'
  /** 第二章 · 已翻过办公桌抽屉（拿到航海日志） */
  | 'drawer_opened'
  /** 第二章 · 已翻过书架上的旧书（拿到密码提示） */
  | 'book_read'
  /** 第二章 · 已砸碎走廊的消防栓玻璃（拿到底舱钥匙） */
  | 'glass_broken'
  /** 第三章 · 已申请支援 */
  | 'requested_backup'
  /** 第三章 · 已进入仓库 */
  | 'entered_warehouse';

export interface GameSnapshot {
  readonly items: readonly ItemId[];
  readonly flags: readonly string[];
  /** 已进入过的探索场景 id（进入文本只播一次） */
  readonly visited?: readonly string[];
  readonly fumbledRounds: readonly number[];
  readonly fumbleCount: number;
  readonly roundIndex: number;
}

export class GameState {
  readonly items = new Set<ItemId>();
  readonly flags = new Set<string>();

  /** 已进入过的探索场景 id —— 决定「进入文本」播不播 */
  readonly visited = new Set<string>();

  private readonly fumbledRounds = new Set<number>();

  /** 破绽总数（对峙表现，决定结局降级） */
  fumbleCount = 0;

  /** 当前对峙回合（0-based） */
  roundIndex = 0;

  // ── 道具 ───────────────────────────────────

  /** @returns true = 这是新获得的道具 */
  addItem(id: ItemId): boolean {
    if (this.items.has(id)) return false;
    this.items.add(id);
    return true;
  }

  has(id: ItemId): boolean {
    return this.items.has(id);
  }

  /**
   * 已获得的道具，按**获得先后**排列。
   *
   * 道具栏直接用它排版：新道具一律追加在末尾，已有道具的位置永不改变。
   * （按类别排序会让玩家捡到东西时整条栏平移，正要点的道具从指下溜走。）
   */
  owned(): ItemId[] {
    return [...this.items];
  }

  hasAll(ids: readonly ItemId[]): boolean {
    return ids.every((id) => this.items.has(id));
  }

  get keyCount(): number {
    return countKeys(this.items);
  }

  get clueCount(): number {
    return countClues(this.items);
  }

  // ── 探索场景到访记录 ───────────────────────

  /** @returns true = 这是第一次进入该场景 */
  markVisited(sceneId: string): boolean {
    if (this.visited.has(sceneId)) return false;
    this.visited.add(sceneId);
    return true;
  }

  /**
   * 续玩用：把一个场景从「已到访」里抹掉，让它的 `onEnter` 再跑一遍。
   *
   * **只 restore 就开跑是不行的**：`visited` 里记着这个场景，
   * `markVisited` 会返回 false，于是 `onEnter` 一声不响地不播。
   * 而 `warehouse_night` 的 `onEnter` 就是「进对峙」—— 不重播的话，
   * 玩家会站在一个没有任何热点的空仓库里，永远出不去。
   *
   * 安全性：全部 7 个 `onEnter` 里只有 `say` / `confrontation`，
   * 没有 `give` / `flag` / `goto`，所以重播一次最多是重听一遍入场词。
   */
  forgetVisited(sceneId: string): void {
    this.visited.delete(sceneId);
  }

  // ── 标记位 ─────────────────────────────────

  setFlag(flag: Flag): void {
    this.flags.add(flag);
  }

  hasFlag(flag: Flag): boolean {
    return this.flags.has(flag);
  }

  // ── 第三章 · 对峙 ──────────────────────────

  get round(): ConfrontationRound | undefined {
    return CONFRONTATION_ROUNDS[this.roundIndex];
  }

  get isConfrontationOver(): boolean {
    return this.roundIndex >= CONFRONTATION_ROUNDS.length || this.fumbleCount >= MAX_FUMBLES;
  }

  /**
   * 出示一件物品。会更新破绽计数与回合进度。
   * 每回合最多记 1 个破绽（反复出错不叠加）。
   */
  present(itemId: ItemId): PresentationResult {
    const result = evaluatePresentation(this.roundIndex, itemId, {
      items: this.items,
      fumbledRounds: this.fumbledRounds,
    });

    switch (result) {
      case 'correct':
      case 'passed':
        this.roundIndex += 1;
        break;
      case 'fumble':
        this.fumbledRounds.add(this.roundIndex);
        this.fumbleCount = Math.min(this.fumbleCount + 1, MAX_FUMBLES);
        break;
      case 'fumble_capped':
      case 'disabled':
        break;
    }

    return result;
  }

  /**
   * 跳过当前回合：手里一件能出示的东西都没有。
   *
   * 语义上等同「没有正确牌」——不计破绽，剧情自然推进。
   * 没有这条口子的话，一件东西都没捡到的玩家会在对峙第一回合就卡死
   * （没有可选项，什么也点不动）。
   */
  abstain(): void {
    if (this.roundIndex < CONFRONTATION_ROUNDS.length) this.roundIndex += 1;
  }

  // ── 结局 ───────────────────────────────────

  resolve(): ResolvedEnding {
    return resolveEnding({
      items: this.items,
      fumbleCount: this.fumbleCount,
      requestedBackup: this.hasFlag('requested_backup'),
    });
  }

  // ── 序列化 ─────────────────────────────────

  snapshot(): GameSnapshot {
    return {
      items: [...this.items],
      flags: [...this.flags],
      visited: [...this.visited],
      fumbledRounds: [...this.fumbledRounds],
      fumbleCount: this.fumbleCount,
      roundIndex: this.roundIndex,
    };
  }

  restore(snap: GameSnapshot): void {
    this.items.clear();
    this.flags.clear();
    this.visited.clear();
    this.fumbledRounds.clear();

    // 每个字段都给默认值。isProgress() 已经在存档边界挡过一道，但 restore
    // 还会被 dev 钩子和单测直接调 —— 缺字段时宁可当成空档，也不要把异常
    // 抛进事件处理器：那里抛出来的异常表现是「按钮点了没反应」，最难查。
    for (const id of snap.items ?? []) this.items.add(id);
    for (const f of snap.flags ?? []) this.flags.add(f as Flag);
    for (const v of snap.visited ?? []) this.visited.add(v);
    for (const r of snap.fumbledRounds ?? []) this.fumbledRounds.add(r);

    this.fumbleCount = snap.fumbleCount ?? 0;
    this.roundIndex = snap.roundIndex ?? 0;
  }

  reset(): void {
    this.items.clear();
    this.flags.clear();
    this.visited.clear();
    this.fumbledRounds.clear();
    this.fumbleCount = 0;
    this.roundIndex = 0;
  }
}
