/**
 * 结局判定 —— 纯逻辑层，不依赖 Phaser，可独立单测。
 *
 * 两级判定（设计文档 6.4 / 7）：
 *   第一级 · 收集  → 结局大类（判定表，18 种组合全覆盖）
 *   第二级 · 破绽  → 结局降级（对峙表现）
 */

import {
  ITEMS,
  KEY_ITEM_IDS,
  CLUE_ITEM_IDS,
  CONFRONTATION_DISABLED,
  type ConfrontationTag,
  type ItemId,
} from '../data/items';
import {
  DETAIL_SLOT,
  ENDINGS,
  FUMBLE_PARAGRAPHS,
  HOLLOW_WIN_DETAILS,
  TIPPED_OFF_NO_BACKUP_FIRST_PARAGRAPH,
  TORN_PAGE_DETAIL_ORDER,
  TORN_PAGE_DETAILS,
  TORN_PAGE_MAX_DETAILS,
  type EndingDef,
  type EndingId,
} from '../data/endings';

export type ItemBag = ReadonlySet<ItemId>;

// ─────────────────────────────────────────────
// 第一级 · 收集 → 结局大类
// ─────────────────────────────────────────────

export function countKeys(items: ItemBag): number {
  return KEY_ITEM_IDS.reduce((n, id) => n + (items.has(id) ? 1 : 0), 0);
}

export function countClues(items: ItemBag): number {
  return CLUE_ITEM_IDS.reduce((n, id) => n + (items.has(id) ? 1 : 0), 0);
}

/** 缺失的常规线索，按 TORN_PAGE_DETAIL_ORDER 排序 */
export function missingClues(items: ItemBag): ItemId[] {
  return TORN_PAGE_DETAIL_ORDER.filter((id) => !items.has(id));
}

/** 线索数低于此值 → 最坏结局（证据不足以支撑行动） */
export const MIN_CLUES_FOR_ACTION = 3;

/** 完美结局所需的线索数 */
export const PERFECT_CLUE_COUNT = 5;

/**
 * 基础判定表（18 种组合全覆盖、不重叠）。
 *
 * | K | C      | 结局 |
 * |---|--------|------|
 * | 任意 | 0–2 | 打草惊蛇 |
 * | 2 | 3–4    | 残页 |
 * | 2 | 5      | 潮落 |
 * | 1（缺铜徽） | 3–5 | 遗徽 |
 * | 1（缺警号牌） | 3–5 | 断号 |
 * | 0 | 3–5    | 无证之胜 |
 */
export function resolveBaseEnding(items: ItemBag): EndingId {
  const k = countKeys(items);
  const c = countClues(items);

  // 全局规则：证据不足以支撑行动
  if (c < MIN_CLUES_FOR_ACTION) return 'tipped_off';

  if (k === 2) {
    return c >= PERFECT_CLUE_COUNT ? 'tide_ebb' : 'torn_page';
  }

  if (k === 1) {
    return items.has('bronze_emblem') ? 'broken_number' : 'lost_emblem';
  }

  return 'hollow_win';
}

// ─────────────────────────────────────────────
// 第二级 · 破绽 → 降级
// ─────────────────────────────────────────────

export const MAX_FUMBLES = 3;

/**
 * 降级映射（设计文档 6.4）。
 *
 * 残页 → 无证之胜 跳过了 L3：L3 的两个结局定义就是"缺一个关键道具"，
 * 把两个道具都在手里的玩家塞进去会自相矛盾。
 */
const DOWNGRADE_MAP: Readonly<Record<EndingId, EndingId>> = {
  tide_ebb: 'torn_page',
  torn_page: 'hollow_win',
  lost_emblem: 'hollow_win',
  broken_number: 'hollow_win',
  hollow_win: 'tipped_off',
  tipped_off: 'tipped_off',
};

export interface DowngradeResult {
  readonly ending: EndingId;
  /** true = 破绽满 3，无条件进入最坏结局 */
  readonly forcedWorst: boolean;
  /** true = 因为破绽而降了一级 */
  readonly downgraded: boolean;
}

export function applyFumbles(base: EndingId, fumbleCount: number): DowngradeResult {
  if (fumbleCount >= MAX_FUMBLES) {
    return { ending: 'tipped_off', forcedWorst: true, downgraded: base !== 'tipped_off' };
  }
  if (fumbleCount >= 1) {
    const next = DOWNGRADE_MAP[base];
    return { ending: next, forcedWorst: false, downgraded: next !== base };
  }
  return { ending: base, forcedWorst: false, downgraded: false };
}

// ─────────────────────────────────────────────
// 动态句
// ─────────────────────────────────────────────

/** 「残页」：按缺失线索拼接，最多并列 2 条 */
export function buildTornPageDetail(items: ItemBag): string {
  const sentences = missingClues(items)
    .map((id) => TORN_PAGE_DETAILS[id])
    .filter((s): s is string => typeof s === 'string')
    .slice(0, TORN_PAGE_MAX_DETAILS);

  if (sentences.length === 0) {
    return '但最后一环始终没能扣上——也许是你慢了半拍，也许是那页纸根本不在你手里。';
  }
  return `但${sentences.join('；')}。`;
}

/** 「无证之胜」：按线索数 */
export function buildHollowWinDetail(items: ItemBag): string {
  return HOLLOW_WIN_DETAILS[countClues(items)] ?? '但案卷里，始终有几处说不清的地方。';
}

export function buildDetail(ending: EndingId, items: ItemBag): string {
  switch (ending) {
    case 'torn_page':
      return buildTornPageDetail(items);
    case 'hollow_win':
      return buildHollowWinDetail(items);
    default:
      return '';
  }
}

// ─────────────────────────────────────────────
// 汇总
// ─────────────────────────────────────────────

export interface ResolveInput {
  readonly items: ItemBag;
  readonly fumbleCount: number;
  /** 第三章开场是否点了对讲机申请支援（只影响文案分支） */
  readonly requestedBackup?: boolean;
}

export interface ResolvedEnding {
  readonly def: EndingDef;
  readonly base: EndingId;
  readonly final: EndingId;
  readonly downgraded: boolean;
  readonly forcedWorst: boolean;
  readonly keyCount: number;
  readonly clueCount: number;
  readonly fumbleCount: number;
  /** 最终正文段落（已替换动态句、已追加失误段） */
  readonly paragraphs: readonly string[];
}

/** 把正文里的占位符换成动态句，并追加失误收尾 */
function composeParagraphs(
  ending: EndingId,
  items: ItemBag,
  base: EndingId,
  fumbleCount: number,
  requestedBackup: boolean,
): string[] {
  const def = ENDINGS[ending];
  const detail = buildDetail(ending, items);

  const paragraphs = def.body
    .map((p) => (p === DETAIL_SLOT ? detail : p))
    .filter((p) => p.length > 0);

  // 打草惊蛇 · 未申请支援版：替换第一段
  if (ending === 'tipped_off' && !requestedBackup) {
    paragraphs[0] = TIPPED_OFF_NO_BACKUP_FIRST_PARAGRAPH;
  }

  // 失误收尾
  if (fumbleCount >= 1 && fumbleCount < MAX_FUMBLES) {
    const tail = FUMBLE_PARAGRAPHS[base];
    if (tail) paragraphs.push(tail);
  }

  return paragraphs;
}

export function resolveEnding(input: ResolveInput): ResolvedEnding {
  const { items, fumbleCount, requestedBackup = true } = input;

  const base = resolveBaseEnding(items);
  const { ending, forcedWorst, downgraded } = applyFumbles(base, fumbleCount);

  return {
    def: ENDINGS[ending],
    base,
    final: ending,
    downgraded,
    forcedWorst,
    keyCount: countKeys(items),
    clueCount: countClues(items),
    fumbleCount,
    paragraphs: composeParagraphs(ending, items, base, fumbleCount, requestedBackup),
  };
}

// ─────────────────────────────────────────────
// 第三章 · 对峙出示判定
// ─────────────────────────────────────────────

export interface ConfrontationRound {
  readonly id: string;
  /** 显示名 */
  readonly target: string;
  /** 能打中这一回合的牌面类别 */
  readonly requires: ConfrontationTag;
}

export const CONFRONTATION_ROUNDS: readonly ConfrontationRound[] = [
  { id: 'chen', target: '陈老板', requires: 'identity' },
  { id: 'crate', target: '防雨布下的货箱', requires: 'cargo' },
  { id: 'chief', target: '戴口罩的"上级领导"', requires: 'protection' },
];

export type PresentationResult =
  /** 打中了，回合通过 */
  | 'correct'
  /** 打偏了，但玩家手里有正确的牌 → 破绽 +1，可重试 */
  | 'fumble'
  /** 打偏了，且玩家手里根本没有正确的牌 → 不计破绽，剧情推进 */
  | 'passed'
  /** 灰显不可选（撬棍 / 底舱钥匙），或未持有该物品 */
  | 'disabled'
  /** 该回合已经记过一次破绽，本次不再叠加（每回合上限 1） */
  | 'fumble_capped';

/** 持有任意一张能打中该回合的牌 */
export function holdsAnswerFor(round: ConfrontationRound, items: ItemBag): boolean {
  return [...items].some((id) => ITEMS[id].tags.includes(round.requires));
}

export function isSelectableInConfrontation(id: ItemId): boolean {
  return !CONFRONTATION_DISABLED.includes(id);
}

export interface EvaluateOptions {
  readonly items: ItemBag;
  /** 已经在这些回合记过破绽（0-based 索引） */
  readonly fumbledRounds: ReadonlySet<number>;
}

/**
 * 判定一次出示。**纯函数**，不改状态。
 *
 * 核心原则：收集决定"你有什么牌"，顺序决定"你打得好不好"。
 * 没有正确的牌时不计破绽 —— 那已由基础判定表惩罚过，不重复扣。
 */
export function evaluatePresentation(
  roundIndex: number,
  itemId: ItemId,
  options: EvaluateOptions,
): PresentationResult {
  const round = CONFRONTATION_ROUNDS[roundIndex];
  if (!round) return 'disabled';

  if (!options.items.has(itemId)) return 'disabled';
  if (!isSelectableInConfrontation(itemId)) return 'disabled';

  const tags = ITEMS[itemId].tags;
  if (tags.includes(round.requires)) return 'correct';

  if (!holdsAnswerFor(round, options.items)) return 'passed';

  return options.fumbledRounds.has(roundIndex) ? 'fumble_capped' : 'fumble';
}
