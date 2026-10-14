/**
 * 第三章 · 对峙的数据自检与流程单测。
 *
 * 判定规则本身在 tests/EndingResolver.test.ts 里已经钉死了（52 项）。
 * 这里守的是**另一层**：台词表、命中区、以及「玩家真的走一遍会怎样」——
 * 尤其是「一件东西都没捡的玩家会不会被卡死」这种只有跑流程才看得见的问题。
 */

import { describe, expect, it } from 'vitest';

import { STAGE_HEIGHT } from '../src/config';
import {
  CLOSING_LINES,
  CONFRONTATION_TARGETS,
  FUMBLE_CAP_LINES,
  ROUND_SCRIPTS,
} from '../src/data/confrontation';
import { CHAPTER_FIRST_SCENE, CHAPTER_ITEMS, SCENES, scenesOfChapter } from '../src/data/chapters';
import { ALL_ITEM_IDS, type ItemId } from '../src/data/items';
import { CONFRONTATION_ROUNDS, MAX_FUMBLES } from '../src/core/EndingResolver';
import { GameState } from '../src/core/GameState';
import { walkEffects, type Rect } from '../src/core/Story';

function fresh(...items: readonly ItemId[]): GameState {
  const s = new GameState();
  for (const id of items) s.addItem(id);
  return s;
}

function overlap(a: Rect, b: Rect): boolean {
  const [ax, ay, aw, ah] = a;
  const [bx, by, bw, bh] = b;
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/** 把三个回合按给定顺序走完（每回合一件），返回状态 */
function play(s: GameState, picks: readonly ItemId[]): void {
  for (const id of picks) {
    if (s.isConfrontationOver) break;
    s.present(id);
  }
}

describe('对峙 · 数据自检', () => {
  it('每个回合都有台词和命中区', () => {
    for (const round of CONFRONTATION_ROUNDS) {
      expect(ROUND_SCRIPTS[round.id], `回合 ${round.id} 缺台词`).toBeDefined();
      expect(CONFRONTATION_TARGETS[round.id], `回合 ${round.id} 缺命中区`).toBeDefined();
    }
  });

  it('台词表没有多余的回合 id', () => {
    const ids = CONFRONTATION_ROUNDS.map((r) => r.id);
    expect(Object.keys(ROUND_SCRIPTS).sort()).toEqual([...ids].sort());
    expect(Object.keys(CONFRONTATION_TARGETS).sort()).toEqual([...ids].sort());
  });

  it('四个分支的台词都不能为空', () => {
    for (const [id, s] of Object.entries(ROUND_SCRIPTS)) {
      for (const key of ['prompt', 'correct', 'fumble', 'passed'] as const) {
        expect(s[key].length, `${id}.${key} 是空的`).toBeGreaterThan(0);
      }
    }
  });

  it('命中区都在画面内', () => {
    for (const [id, t] of Object.entries(CONFRONTATION_TARGETS)) {
      const [x, y, w, h] = t.rect;
      expect(x, id).toBeGreaterThanOrEqual(0);
      expect(y, id).toBeGreaterThanOrEqual(0);
      expect(x + w, id).toBeLessThanOrEqual(720);
      expect(y + h, id).toBeLessThanOrEqual(STAGE_HEIGHT);
    }
  });

  it('三个命中区互不重叠（否则「点错人」没法判定）', () => {
    const entries = Object.entries(CONFRONTATION_TARGETS);
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [ia, a] = entries[i]!;
        const [ib, b] = entries[j]!;
        expect(overlap(a.rect, b.rect), `${ia} 与 ${ib} 重叠`).toBe(false);
      }
    }
  });

  it('过渡与收束台词不为空', () => {
    expect(CLOSING_LINES.length).toBeGreaterThan(0);
    expect(FUMBLE_CAP_LINES.length).toBeGreaterThan(0);
  });
});

describe('第三章 · 数据接线', () => {
  it('第三章的第一个场景存在', () => {
    const first = CHAPTER_FIRST_SCENE[2];
    expect(first).toBeDefined();
    expect(SCENES[first!]).toBeDefined();
  });

  it('仓库里真的会走到对峙', () => {
    const night = SCENES['warehouse_night'];
    expect(night).toBeDefined();
    const effects = walkEffects(night!.onEnter ?? []);
    expect(effects.some((e) => e.t === 'confrontation')).toBe(true);
  });

  it('第三章不发道具（CHAPTER_ITEMS 与关卡数据一致）', () => {
    const scenes = scenesOfChapter(2);
    const fromScenes = scenes
      .flatMap((s) => walkEffects(s.hotspots.flatMap((h) => h.branches.flatMap((b) => b.effects))))
      .flatMap((e) => (e.t === 'give' ? [e.item] : []));
    expect(fromScenes).toEqual([]);
    expect(CHAPTER_ITEMS[2]).toEqual([]);
  });

  it('对峙用得到的牌都在前面两章能拿到', () => {
    const obtainable = new Set<ItemId>([...(CHAPTER_ITEMS[0] ?? []), ...(CHAPTER_ITEMS[1] ?? [])]);
    for (const id of obtainable) expect(ALL_ITEM_IDS).toContain(id);
    // 三张关键牌必须都能拿到，否则某些结局永远打不出来
    for (const id of ['bronze_emblem', 'badge_half', 'altered_manifest'] as const) {
      expect(obtainable.has(id), `${id} 拿不到`).toBe(true);
    }
  });
});

describe('对峙 · 流程', () => {
  const ALL = [...ALL_ITEM_IDS];
  const BEST = ['bronze_emblem', 'altered_manifest', 'badge_half'] as const;

  it('三回合全出示正确 → 完美结局，零破绽', () => {
    const s = fresh(...ALL);
    play(s, BEST);
    expect(s.fumbleCount).toBe(0);
    expect(s.isConfrontationOver).toBe(true);
    const r = s.resolve();
    expect(r.final).toBe('tide_ebb');
    expect(r.downgraded).toBe(false);
  });

  it('打偏一次 → 破绽 +1、回合不推进；改出正确的牌后继续', () => {
    const s = fresh(...ALL);
    // 薄荷烟蒂打不中「身份」这一回合，但手里有铜徽 → 破绽
    expect(s.present('mint_cigarette')).toBe('fumble');
    expect(s.fumbleCount).toBe(1);
    expect(s.roundIndex).toBe(0);
    expect(s.present('bronze_emblem')).toBe('correct');
    expect(s.roundIndex).toBe(1);
  });

  it('同一回合反复打偏不叠加破绽', () => {
    const s = fresh(...ALL);
    expect(s.present('mint_cigarette')).toBe('fumble');
    expect(s.present('ivory_sample')).toBe('fumble_capped');
    expect(s.fumbleCount).toBe(1);
  });

  it('手里没有能打中的牌 → 不计破绽，剧情推进', () => {
    // 三条线索的 tags 都是空的，打不中任何一回合
    const s = fresh('mint_cigarette', 'cut_mark', 'customs_seal');
    expect(s.present('mint_cigarette')).toBe('passed');
    expect(s.fumbleCount).toBe(0);
    expect(s.roundIndex).toBe(1);
  });

  it('撬棍与底舱钥匙灰显不可选，且不改动任何状态', () => {
    const s = fresh(...ALL);
    expect(s.present('crowbar')).toBe('disabled');
    expect(s.present('hold_key')).toBe('disabled');
    expect(s.roundIndex).toBe(0);
    expect(s.fumbleCount).toBe(0);
  });

  it('三回合全部打偏 → 无条件「打草惊蛇」', () => {
    const s = fresh(...ALL);
    play(s, ['mint_cigarette', 'bronze_emblem', 'mint_cigarette', 'altered_manifest', 'mint_cigarette']);
    expect(s.fumbleCount).toBe(MAX_FUMBLES);
    expect(s.isConfrontationOver).toBe(true);
    const r = s.resolve();
    expect(r.final).toBe('tipped_off');
    expect(r.forcedWorst).toBe(true);
  });

  it('破绽 1 个 → 完美结局降一级到「残页」（跳过 L3）', () => {
    const s = fresh(...ALL);
    play(s, ['mint_cigarette', 'bronze_emblem', 'altered_manifest', 'badge_half']);
    expect(s.fumbleCount).toBe(1);
    const r = s.resolve();
    expect(r.final).toBe('torn_page');
    expect(r.downgraded).toBe(true);
  });

  it('一件东西都没捡的玩家不会被卡死', () => {
    const s = fresh();
    // 场景层的规则：没有任何可出示的东西 → abstain，而不是干等
    expect(ALL_ITEM_IDS.some((id) => s.has(id))).toBe(false);
    for (let i = 0; i < CONFRONTATION_ROUNDS.length; i++) s.abstain();
    expect(s.isConfrontationOver).toBe(true);
    expect(s.fumbleCount).toBe(0);
    expect(s.resolve().final).toBe('tipped_off');
  });

  it('只捡了撬棍的玩家也不会被卡死', () => {
    const s = fresh('crowbar');
    // 撬棍在所有回合都是 disabled —— 场景层会判定「没有可出示的东西」
    for (let i = 0; i < CONFRONTATION_ROUNDS.length; i++) s.abstain();
    expect(s.isConfrontationOver).toBe(true);
    expect(s.resolve().final).toBe('tipped_off');
  });

  it('abstain 不会越界，也不会动破绽计数', () => {
    const s = fresh();
    for (let i = 0; i < 10; i++) s.abstain();
    expect(s.roundIndex).toBe(CONFRONTATION_ROUNDS.length);
    expect(s.fumbleCount).toBe(0);
  });

  it('六个结局在对峙里都可达（穷举 K/C 与破绽的合法组合）', () => {
    const bases = new Set<string>();
    for (const picks of [
      BEST as unknown as ItemId[],
      ['mint_cigarette', 'bronze_emblem', 'altered_manifest', 'badge_half'] as ItemId[],
    ]) {
      const s = fresh(...ALL);
      play(s, picks);
      bases.add(s.resolve().final);
    }
    expect(bases.size).toBeGreaterThan(1);
  });
});
