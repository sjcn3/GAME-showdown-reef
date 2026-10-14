import { describe, expect, it } from 'vitest';

import {
  CONFRONTATION_ROUNDS,
  MAX_FUMBLES,
  applyFumbles,
  buildTornPageDetail,
  countClues,
  countKeys,
  evaluatePresentation,
  holdsAnswerFor,
  missingClues,
  resolveBaseEnding,
  resolveEnding,
} from '../src/core/EndingResolver';
import { CLUE_ITEM_IDS, KEY_ITEM_IDS, type ItemId } from '../src/data/items';
import type { EndingId } from '../src/data/endings';
import { GameState } from '../src/core/GameState';

// ── 测试夹具 ────────────────────────────────────

const [EMBLEM, BADGE] = KEY_ITEM_IDS as [ItemId, ItemId];
const [CUT, CIG, MANIFEST, LOG, LIST] = CLUE_ITEM_IDS as [
  ItemId,
  ItemId,
  ItemId,
  ItemId,
  ItemId,
];

function bag(keys: readonly ItemId[], clues: readonly ItemId[]): Set<ItemId> {
  return new Set<ItemId>([...keys, ...clues]);
}

const K2 = [EMBLEM, BADGE] as const;
const K_ONLY_EMBLEM = [EMBLEM] as const; // 缺警号牌
const K_ONLY_BADGE = [BADGE] as const; // 缺铜徽
const K0 = [] as const;

function clues(n: number): ItemId[] {
  return CLUE_ITEM_IDS.slice(0, n);
}

// ── 1. 判定表 18 格全覆盖 ───────────────────────

describe('判定表：18 格 (K, C) 全覆盖', () => {
  // 18 格 = 3 种 K 值（0 / 1 / 2）× 6 种 C 值（0~5）。
  // K=1 那一格再按"缺哪件关键道具"拆成两个结局，见下一个 describe。
  const cells: Array<[readonly ItemId[], number, EndingId]> = [];

  for (let c = 0; c <= 5; c++) {
    const worst = c < 3;

    cells.push([K2, c, worst ? 'tipped_off' : c === 5 ? 'tide_ebb' : 'torn_page']);
    cells.push([K_ONLY_EMBLEM, c, worst ? 'tipped_off' : 'broken_number']);
    cells.push([K0, c, worst ? 'tipped_off' : 'hollow_win']);
  }

  it.each(cells)('K=%s C=%i → %s', (keys, c, expected) => {
    expect(resolveBaseEnding(bag(keys, clues(c)))).toBe(expected);
  });

  it('恰好 18 格', () => {
    expect(cells).toHaveLength(18);
  });

  it('K=0 / 1 / 2 三档各自独立', () => {
    const byKeyCount = new Map<number, Set<EndingId>>();
    for (const [keys, c, expected] of cells) {
      const k = keys.length;
      if (!byKeyCount.has(k)) byKeyCount.set(k, new Set());
      byKeyCount.get(k)!.add(expected);
    }
    expect([...byKeyCount.keys()].sort()).toEqual([0, 1, 2]);
  });
});

describe('K=1 的拆分：缺哪件决定结局', () => {
  const split: Array<[readonly ItemId[], string, EndingId]> = [
    [K_ONLY_EMBLEM, '缺警号牌', 'broken_number'],
    [K_ONLY_BADGE, '缺铜徽', 'lost_emblem'],
  ];

  it.each(split)('%s + 线索 ≥3 → %s', (keys, _label, expected) => {
    for (let c = 3; c <= 5; c++) {
      expect(resolveBaseEnding(bag(keys, clues(c)))).toBe(expected);
    }
  });

  it('线索 ≤2 时两者都落到最坏结局（全局规则优先）', () => {
    for (let c = 0; c <= 2; c++) {
      expect(resolveBaseEnding(bag(K_ONLY_EMBLEM, clues(c)))).toBe('tipped_off');
      expect(resolveBaseEnding(bag(K_ONLY_BADGE, clues(c)))).toBe('tipped_off');
    }
  });

  it('所有 6 个结局都可达', () => {
    const reached = new Set<EndingId>();
    for (const keys of [K2, K_ONLY_EMBLEM, K_ONLY_BADGE, K0]) {
      for (let c = 0; c <= 5; c++) reached.add(resolveBaseEnding(bag(keys, clues(c))));
    }
    expect([...reached].sort()).toEqual(
      ['broken_number', 'hollow_win', 'lost_emblem', 'tide_ebb', 'tipped_off', 'torn_page'].sort(),
    );
  });
});

// ── 2. 计数 ────────────────────────────────────

describe('计数与缺失', () => {
  it('工具与附属物证不参与 K / C', () => {
    const items = bag(
      [EMBLEM, BADGE],
      [...clues(5)],
    );
    items.add('crowbar');
    items.add('hold_key');
    items.add('customs_seal');
    items.add('ivory_sample');

    expect(countKeys(items)).toBe(2);
    expect(countClues(items)).toBe(5);
  });

  it('missingClues 按固定顺序返回', () => {
    expect(missingClues(bag(K2, [CUT, CIG, MANIFEST]))).toEqual([LIST, LOG]);
    expect(missingClues(bag(K2, []))).toEqual([LIST, LOG, CIG, MANIFEST, CUT]);
  });
});

// ── 3. 破绽降级链 ───────────────────────────────

describe('破绽 → 降级', () => {
  it('破绽 0：不降级', () => {
    for (const base of [
      'tide_ebb',
      'torn_page',
      'lost_emblem',
      'broken_number',
      'hollow_win',
      'tipped_off',
    ] as EndingId[]) {
      expect(applyFumbles(base, 0)).toEqual({
        ending: base,
        forcedWorst: false,
        downgraded: false,
      });
    }
  });

  it('破绽 1~2：降一级', () => {
    expect(applyFumbles('tide_ebb', 1).ending).toBe('torn_page');
    expect(applyFumbles('torn_page', 1).ending).toBe('hollow_win');
    expect(applyFumbles('lost_emblem', 2).ending).toBe('hollow_win');
    expect(applyFumbles('broken_number', 2).ending).toBe('hollow_win');
    expect(applyFumbles('hollow_win', 1).ending).toBe('tipped_off');
    expect(applyFumbles('tipped_off', 2).ending).toBe('tipped_off');
  });

  it('残页降级跳过 L3（不出现"缺道具"的自相矛盾）', () => {
    // 两个关键道具都在手里，却掉进"遗徽/断号"是不合逻辑的
    expect(applyFumbles('torn_page', 1).ending).not.toBe('lost_emblem');
    expect(applyFumbles('torn_page', 1).ending).not.toBe('broken_number');
  });

  it('破绽满 3：无条件最坏结局', () => {
    for (const base of ['tide_ebb', 'torn_page', 'lost_emblem', 'hollow_win'] as EndingId[]) {
      const r = applyFumbles(base, MAX_FUMBLES);
      expect(r.ending).toBe('tipped_off');
      expect(r.forcedWorst).toBe(true);
    }
  });

  it('完整收集 + 1 个破绽 → 完美被降为准完美', () => {
    const items = bag(K2, clues(5));
    expect(resolveBaseEnding(items)).toBe('tide_ebb');

    const r = resolveEnding({ items, fumbleCount: 1 });
    expect(r.base).toBe('tide_ebb');
    expect(r.final).toBe('torn_page');
    expect(r.downgraded).toBe(true);
    // 失误收尾必须来自"基础结局"而不是降级后的结局
    expect(r.paragraphs.at(-1)).toContain('慢了半拍');
  });

  it('完整收集 + 3 个破绽 → 打草惊蛇', () => {
    const r = resolveEnding({ items: bag(K2, clues(5)), fumbleCount: 3 });
    expect(r.final).toBe('tipped_off');
    expect(r.forcedWorst).toBe(true);
  });
});

// ── 4. 动态句 ──────────────────────────────────

describe('动态句', () => {
  it('残页：缺 1 条 → 1 句', () => {
    const s = buildTornPageDetail(bag(K2, [CUT, CIG, MANIFEST, LOG]));
    expect(s).toBe('但名单残页上「分管副局长 · 代号『信天翁』」那一行，正好被撕口截断。');
  });

  it('残页：缺 2 条 → 并列 2 句', () => {
    const s = buildTornPageDetail(bag(K2, [CUT, CIG, MANIFEST]));
    expect(s).toContain('名单残页');
    expect(s).toContain('夜航');
    expect(s.split('；')).toHaveLength(2);
  });

  it('残页：缺 5 条 → 最多 2 句（上限生效）', () => {
    const s = buildTornPageDetail(bag(K2, []));
    expect(s.split('；')).toHaveLength(2);
  });

  it('无证之胜：随线索数变化', () => {
    const a = resolveEnding({ items: bag(K0, clues(3)), fumbleCount: 0 });
    const b = resolveEnding({ items: bag(K0, clues(4)), fumbleCount: 0 });
    const c = resolveEnding({ items: bag(K0, clues(5)), fumbleCount: 0 });

    expect(a.paragraphs.join('\n')).toContain('几条航线的去向');
    expect(b.paragraphs.join('\n')).toContain('说不清的环节');
    expect(c.paragraphs.join('\n')).toContain('证据是齐的');
  });

  it('打草惊蛇：未申请支援 → 替换第一段', () => {
    const items = bag(K0, clues(1));
    const withBackup = resolveEnding({ items, fumbleCount: 0, requestedBackup: true });
    const without = resolveEnding({ items, fumbleCount: 0, requestedBackup: false });

    expect(withBackup.paragraphs[0]).toContain('强行申请了行动');
    expect(without.paragraphs[0]).toContain('连支援都没等');
  });

  it('正文里不残留占位符', () => {
    for (const k of [K2, K_ONLY_BADGE, K0]) {
      for (const c of [0, 3, 5]) {
        const r = resolveEnding({ items: bag(k, clues(c)), fumbleCount: 0 });
        expect(r.paragraphs.join('')).not.toContain('{{');
      }
    }
  });
});

// ── 5. 对峙出示判定 ─────────────────────────────

describe('第三章 · 对峙判定', () => {
  const opts = (items: ItemId[], fumbled: number[] = []) => ({
    items: new Set(items),
    fumbledRounds: new Set(fumbled),
  });

  it('三个回合的正确牌', () => {
    expect(evaluatePresentation(0, EMBLEM, opts([EMBLEM]))).toBe('correct');
    expect(evaluatePresentation(1, MANIFEST, opts([MANIFEST]))).toBe('correct');
    expect(evaluatePresentation(1, CUT, opts([CUT]))).toBe('correct');
    expect(evaluatePresentation(1, LOG, opts([LOG]))).toBe('correct');
    expect(evaluatePresentation(2, BADGE, opts([BADGE]))).toBe('correct');
  });

  it('持有正确牌却出错了 → 破绽', () => {
    expect(evaluatePresentation(0, LIST, opts([EMBLEM, LIST]))).toBe('fumble');
    expect(evaluatePresentation(2, LIST, opts([BADGE, LIST]))).toBe('fumble');
  });

  it('没有正确牌 → 不计破绽，剧情推进', () => {
    // 缺铜徽：回合 1 无论出什么都记 passed
    expect(evaluatePresentation(0, LIST, opts([LIST, BADGE]))).toBe('passed');
    expect(holdsAnswerFor(CONFRONTATION_ROUNDS[0]!, new Set([LIST, BADGE]))).toBe(false);
  });

  it('烟蒂与名单残页打不中任何一回合（残页证明不了"他就是信天翁"）', () => {
    // 但玩家手里有正确的牌时，出示它们要付代价
    expect(evaluatePresentation(0, CIG, opts([EMBLEM, CIG]))).toBe('fumble');
    expect(evaluatePresentation(1, LIST, opts([LOG, LIST]))).toBe('fumble');
    expect(evaluatePresentation(2, LIST, opts([BADGE, LIST]))).toBe('fumble');
  });

  it('撬棍 / 底舱钥匙灰显不可选', () => {
    expect(evaluatePresentation(0, 'crowbar', opts([EMBLEM, 'crowbar']))).toBe('disabled');
    expect(evaluatePresentation(1, 'hold_key', opts([LOG, 'hold_key']))).toBe('disabled');
  });

  it('未持有的物品不可出示', () => {
    expect(evaluatePresentation(0, EMBLEM, opts([]))).toBe('disabled');
  });

  it('每回合最多记 1 个破绽', () => {
    expect(evaluatePresentation(0, LIST, opts([EMBLEM, LIST], [0]))).toBe('fumble_capped');
  });
});

// ── 6. GameState 集成 ───────────────────────────

describe('GameState', () => {
  function fullPlaythrough(): GameState {
    const s = new GameState();
    for (const id of [...KEY_ITEM_IDS, ...CLUE_ITEM_IDS]) s.addItem(id);
    return s;
  }

  it('addItem 返回是否为新获得', () => {
    const s = new GameState();
    expect(s.addItem(EMBLEM)).toBe(true);
    expect(s.addItem(EMBLEM)).toBe(false);
  });

  it('连续答对三个回合 → 破绽 0，进入结局', () => {
    const s = fullPlaythrough();
    expect(s.present(EMBLEM)).toBe('correct');
    expect(s.present(LOG)).toBe('correct');
    expect(s.present(BADGE)).toBe('correct');

    expect(s.fumbleCount).toBe(0);
    expect(s.isConfrontationOver).toBe(true);
    expect(s.resolve().final).toBe('tide_ebb');
  });

  it('回合 1 出错两次只记 1 个破绽', () => {
    const s = fullPlaythrough();
    expect(s.present(CIG)).toBe('fumble');
    expect(s.present(LIST)).toBe('fumble_capped');
    expect(s.fumbleCount).toBe(1);
    expect(s.roundIndex).toBe(0); // 还没通过

    expect(s.present(EMBLEM)).toBe('correct');
    expect(s.roundIndex).toBe(1);
    expect(s.resolve().final).toBe('torn_page');
  });

  it('三回合全错 → 破绽满 3 → 打草惊蛇', () => {
    const s = fullPlaythrough();
    s.present(CIG); // 回合 1 破绽
    s.present(EMBLEM);
    s.present(LIST); // 回合 2 破绽
    s.present(LOG);
    s.present(CIG); // 回合 3 破绽

    expect(s.fumbleCount).toBe(3);
    expect(s.isConfrontationOver).toBe(true);
    expect(s.resolve().final).toBe('tipped_off');
    expect(s.resolve().forcedWorst).toBe(true);
  });

  it('缺铜徽玩家在回合 1 出什么都不会被记破绽', () => {
    const s = new GameState();
    s.addItem(BADGE);
    for (const c of CLUE_ITEM_IDS) s.addItem(c);

    expect(s.present(LIST)).toBe('passed');
    expect(s.fumbleCount).toBe(0);
    expect(s.roundIndex).toBe(1);
  });

  it('快照往返一致', () => {
    const s = fullPlaythrough();
    s.setFlag('safe_opened');
    s.present(CIG); // 制造一个破绽
    s.present(EMBLEM);

    const snap = s.snapshot();
    const restored = new GameState();
    restored.restore(snap);

    expect(restored.snapshot()).toEqual(snap);
    expect(restored.resolve()).toEqual(s.resolve());
  });

  it('reset 清空一切', () => {
    const s = fullPlaythrough();
    s.present(EMBLEM);
    s.reset();

    expect(s.keyCount).toBe(0);
    expect(s.clueCount).toBe(0);
    expect(s.fumbleCount).toBe(0);
    expect(s.roundIndex).toBe(0);
    expect(s.hasFlag('vent_opened')).toBe(false);
  });
});
