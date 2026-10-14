/**
 * 关卡数据的自检。
 *
 * 这一组测试守的是「剧本 → 数据」翻译过程中的手滑：
 * 热点坐标写反、需求道具拼错、goto 到一个不存在的场景、文档 id 打错……
 * 这些错误在运行时只表现为「点了没反应」，靠肉眼玩很难发现。
 */

import { describe, expect, it } from 'vitest';

import { CHAPTER_FIRST_SCENE, CHAPTER_ITEMS, SCENES, chapterDone } from '../src/data/chapters';
import { DOCS } from '../src/data/documents';
import { ITEMS, type ItemId } from '../src/data/items';
import { GameState } from '../src/core/GameState';
import { collectiblesOf, hits, pickBranch, walkEffects, type Ctx, type Effect, type SceneDef } from '../src/core/Story';
import { STAGE_HEIGHT } from '../src/config';

const ALL = Object.values(SCENES);

/** 按坐标点一下，返回被执行的分支效果（与 ExploreScene.handleStage 同一套判定） */
function clickAt(
  sceneId: string,
  x: number,
  y: number,
  state: GameState,
  held: ItemId | null = null,
): readonly Effect[] | null {
  const def = SCENES[sceneId]!;
  const ctx: Ctx = { state, held };
  for (const h of def.hotspots) {
    if (!hits(h.rect, x, y)) continue;
    const i = pickBranch(h.branches, ctx);
    if (i < 0) continue;
    return h.branches[i]!.effects;
  }
  return null;
}

/** 点某个热点的中心 */
function clickHotspot(
  sceneId: string,
  hotspotId: string,
  state: GameState,
  held: ItemId | null = null,
): readonly Effect[] | null {
  const h = SCENES[sceneId]!.hotspots.find((s) => s.id === hotspotId);
  if (!h) throw new Error(`没有这个热点：${sceneId}.${hotspotId}`);
  const [x, y, w, hh] = h.rect;
  return clickAt(sceneId, x + w / 2, y + hh / 2, state, held);
}

/**
 * 把一批效果作用到状态上；返回下一场景 id（没有 goto 就返回 null）。
 *
 * 会钻进嵌套的效果列表（密码盘的 success / 找找闸门的 then）——
 * 单测关心的是「数据上够不够得着」，不是引擎的提示策略。
 */
interface RunOptions {
  /** 密码盘这次输入的号码；省略 = 玩家直接关掉面板，走不进 success */
  readonly code?: string;
}

function run(
  effects: readonly Effect[] | null,
  state: GameState,
  options: RunOptions = {},
): string | null {
  let next: string | null = null;
  for (const e of effects ?? []) {
    switch (e.t) {
      case 'give':
        state.addItem(e.item);
        break;
      case 'flag':
        state.setFlag(e.flag);
        break;
      case 'goto':
        next = e.scene;
        break;
      case 'password':
        if (options.code === e.answer) next = run(e.success, state, options) ?? next;
        break;
      case 'searchAgain':
        next = run(e.then, state, options) ?? next;
        break;
      default:
        break;
    }
  }
  return next;
}

describe('关卡数据 · 结构自检', () => {
  it('每个 goto 目标都是已注册的场景', () => {
    for (const s of ALL) {
      for (const e of allEffects(s)) {
        if (e.t === 'goto') {
          expect(SCENES[e.scene], `${s.id} → ${e.scene}`).toBeDefined();
        }
      }
    }
  });

  it('每个 openDoc 都是已定义的文档', () => {
    for (const s of ALL) {
      for (const e of allEffects(s)) {
        if (e.t === 'openDoc') {
          expect(DOCS[e.doc], `${s.id} → ${e.doc}`).toBeDefined();
        }
      }
    }
  });

  it('每个 needs 都是真实存在的道具', () => {
    for (const s of ALL) {
      for (const h of s.hotspots) {
        for (const b of h.branches) {
          if (b.needs) expect(ITEMS[b.needs], `${s.id}.${h.id}`).toBeDefined();
        }
      }
    }
  });

  it('热点命中区都落在舞台可视范围内，且不越出下边界', () => {
    for (const s of ALL) {
      for (const h of s.hotspots) {
        const [x, y, w, hh] = h.rect;
        expect(w, `${s.id}.${h.id} 宽度`).toBeGreaterThan(0);
        expect(hh, `${s.id}.${h.id} 高度`).toBeGreaterThan(0);
        expect(x, `${s.id}.${h.id} 左边界`).toBeGreaterThanOrEqual(0);
        expect(y, `${s.id}.${h.id} 上边界`).toBeGreaterThanOrEqual(0);
        expect(x + w, `${s.id}.${h.id} 右边界`).toBeLessThanOrEqual(720);
        // 热点不能压到道具栏，否则点不到
        expect(y + hh, `${s.id}.${h.id} 下边界`).toBeLessThanOrEqual(STAGE_HEIGHT);
      }
    }
  });

  it('空手点每个热点都该有反应（要么自己回应，要么被压在下面的热点接住）', () => {
    for (const s of ALL) {
      for (const h of s.hotspots) {
        const [x, y, w, hh] = h.rect;
        const effects = clickAt(s.id, x + w / 2, y + hh / 2, new GameState());
        expect(effects, `${s.id}.${h.id} 点下去毫无反应`).not.toBeNull();
        expect(effects!.length, `${s.id}.${h.id} 的效果是空的`).toBeGreaterThan(0);
      }
    }
  });

  it('热点 id 在场景内唯一', () => {
    for (const s of ALL) {
      const ids = s.hotspots.map((h) => h.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
    }
  });
});

describe('关卡数据 · 与「要不要再找找？」的一致性', () => {
  it('CHAPTER_ITEMS 与从 SCENES 扫出来的可收集物完全一致', () => {
    for (let ch = 0; ch < 3; ch++) {
      const scanned = collectiblesOf(ALL, ch);
      const declared = [...(CHAPTER_ITEMS[ch] ?? [])];
      expect(new Set(scanned), `第 ${ch + 1} 章`).toEqual(new Set(declared));
    }
  });

  it('CHAPTER_ITEMS 里的每个 id 都是真实道具（反向不漏）', () => {
    for (const [ch, ids] of Object.entries(CHAPTER_ITEMS)) {
      for (const id of ids) expect(ITEMS[id], `第 ${ch} 章声明了不存在的道具 ${id}`).toBeDefined();
    }
  });

  it('第一章的可收集清单就是剧本里的那 7 件', () => {
    expect(new Set(CHAPTER_ITEMS[0])).toEqual(
      new Set<ItemId>([
        'bronze_emblem',
        'ivory_sample',
        'customs_seal',
        'crowbar',
        'cut_mark',
        'mint_cigarette',
        'altered_manifest',
      ]),
    );
  });

  it('第二章的可收集清单就是剧本里的那 4 件', () => {
    expect(new Set(CHAPTER_ITEMS[1])).toEqual(
      new Set<ItemId>(['ship_log', 'badge_half', 'list_fragment', 'hold_key']),
    );
  });
});

describe('第二章 · 昌隆号', () => {
  it('保险柜：输错不开柜，输对才给警号牌与名单残页', () => {
    const effects = clickHotspot('captain_cabin', 'safe', new GameState());
    const pw = effects?.find((e) => e.t === 'password');
    if (pw?.t !== 'password') throw new Error('保险柜热点应当是密码盘');

    // 输错：面板不关（引擎负责），但状态一点不动
    const wrong = new GameState();
    run(effects, wrong, { code: '1234' });
    expect(wrong.has('badge_half')).toBe(false);
    expect(wrong.has('list_fragment')).toBe(false);
    expect(wrong.hasFlag('safe_opened')).toBe(false);

    // 输对：两件都到手，并触发闪回 2
    const right = new GameState();
    run(effects, right, { code: '0808' });
    expect(right.has('badge_half')).toBe(true);
    expect(right.has('list_fragment')).toBe(true);
    expect(right.hasFlag('safe_opened')).toBe(true);
    expect(walkEffects(pw.success).some((e) => e.t === 'flashback')).toBe(true);
  });

  it('密码 0808 真的能从航海日志那条手写记录推出来', () => {
    // 这是「谜题可解性」的底线：日志上的日期、密码、旧书提示三者必须自洽。
    const hand = DOCS.ship_log.lines.filter((l) => l.style === 'hand');
    expect(hand).toHaveLength(1);

    // 取日期本身（2026.08.08 → 20260808），别把后面「7 海里」的 7 也数进去
    const date = /(\d{4})\.(\d{2})\.(\d{2})/.exec(hand[0]!.text);
    expect(date, '手写那条里应当有 2026.08.08 这样的日期').not.toBeNull();
    const digits = `${date![1]}${date![2]}${date![3]}`;
    expect(digits).toBe('20260808');
    expect(digits.slice(-4)).toBe('0808');

    const hint = DOCS.old_book.lines.map((l) => l.text).join('');
    expect(hint).toContain('后四位');
  });

  it('保险柜开过之后再点，不再重复发道具', () => {
    const s = new GameState();
    s.setFlag('safe_opened');
    const effects = clickHotspot('captain_cabin', 'safe', s);
    expect(walkEffects(effects ?? []).some((e) => e.t === 'password')).toBe(false);
    expect(walkEffects(effects ?? []).some((e) => e.t === 'give')).toBe(false);
  });

  it('消防栓：第一次砸碎给底舱钥匙，之后只剩空箱子', () => {
    const s = new GameState();
    const first = clickHotspot('corridor', 'hydrant', s);
    run(first, s);
    expect(s.has('hold_key')).toBe(true);
    expect(s.hasFlag('glass_broken')).toBe(true);

    const second = clickHotspot('corridor', 'hydrant', s);
    expect(walkEffects(second ?? []).some((e) => e.t === 'give')).toBe(false);
  });

  it('底舱门：没钥匙只有一句台词；有钥匙也先拦一次，再点才下底舱', () => {
    const noKey = new GameState();
    const locked = clickHotspot('corridor', 'bilge_door', noKey);
    expect(walkEffects(locked ?? []).some((e) => e.t === 'goto')).toBe(false);

    const withKey = new GameState();
    withKey.addItem('hold_key');
    const gated = clickHotspot('corridor', 'bilge_door', withKey);
    expect(gated?.some((e) => e.t === 'searchAgain')).toBe(true);
    // 闸门是「第一次只提示」，所以数据里必须仍然够得着 goto
    expect(run(gated, withKey)).toBe('bilge');
  });

  it('按剧本走一遍第二章能拿齐 4 件东西，并推进到第三章', () => {
    const s = new GameState();
    s.setFlag('zhou_talked');

    // 船长室：抽屉 → 航海日志
    run(clickHotspot('captain_cabin', 'drawer', s), s);
    expect(s.has('ship_log')).toBe(true);
    expect(s.hasFlag('drawer_opened')).toBe(true);

    // 书架：旧书 → 密码提示
    run(clickHotspot('captain_cabin', 'shelf', s), s);
    expect(s.hasFlag('book_read')).toBe(true);
    expect(s.hasFlag('password_hint_read')).toBe(true);

    // 保险柜：拨 0808
    run(clickHotspot('captain_cabin', 'safe', s), s, { code: '0808' });

    // 右侧舱门 → 走廊
    expect(run(clickHotspot('captain_cabin', 'door_out', s), s)).toBe('corridor');

    // 走廊：砸消防栓玻璃 → 底舱钥匙 → 底舱门
    run(clickHotspot('corridor', 'hydrant', s), s);
    expect(s.has('hold_key')).toBe(true);
    expect(run(clickHotspot('corridor', 'bilge_door', s), s)).toBe('bilge');

    // 底舱：记下这批货 → 推进第三章
    const advance = clickHotspot('bilge', 'sacks', s);
    expect(advance?.some((e) => e.t === 'advanceChapter' && e.to === 2)).toBe(true);

    expect(chapterDone(1, s)).toBe(true);
    // 从空存档开始走第二章，手里正好是这一章的 4 件
    expect(new Set(s.owned())).toEqual(
      new Set<ItemId>(['ship_log', 'badge_half', 'list_fragment', 'hold_key']),
    );
  });

  it('走廊可以原路回船长室（否则漏了保险柜就永远补不回来）', () => {
    const s = new GameState();
    expect(run(clickHotspot('corridor', 'back_cabin', s), s)).toBe('captain_cabin');
    expect(run(clickHotspot('bilge', 'back_up', s), s)).toBe('corridor');
  });
});

describe('分支判定 · pickBranch', () => {
  it('手持道具时，不需要道具的分支会被跳过', () => {
    const state = new GameState();
    const def = SCENES['dock_exterior']!;
    const vent = def.hotspots.find((h) => h.id === 'vent')!;

    const bare: Ctx = { state, held: null };
    expect(pickBranch(vent.branches, bare)).toBe(2); // 徒手 → 掰不动

    const withBar: Ctx = { state, held: 'crowbar' };
    expect(pickBranch(vent.branches, withBar)).toBe(0); // 持撬棍 → 撬开
  });

  it('没发现切割痕迹时点暗格，会落到它下面的「内壁壁板」上', () => {
    const state = new GameState();
    const def = SCENES['container_interior']!;
    const cache = def.hotspots.find((h) => h.id === 'cache')!;
    const [x, y, w, hh] = cache.rect;

    expect(clickAt('container_interior', x + w / 2, y + hh / 2, state)).toBe(
      def.hotspots.find((h) => h.id === 'wall')!.branches[0]!.effects,
    );
  });

  it('发现切割痕迹后，同一个点变成暗格', () => {
    const state = new GameState();
    state.setFlag('cut_mark_found');
    const cache = SCENES['container_interior']!.hotspots.find((h) => h.id === 'cache')!;
    const [x, y, w, hh] = cache.rect;

    const effects = clickAt('container_interior', x + w / 2, y + hh / 2, state);
    expect(effects).toBe(cache.branches[0]!.effects);
  });
});

describe('第一章 · 全流程可通', () => {
  it('按剧本走一遍能拿齐 7 件东西，并推进到第二章', () => {
    const state = new GameState();

    // ── 场景 1：黄昏码头 ──
    expect(state.markVisited('dock_exterior')).toBe(true);

    run(clickHotspot('dock_exterior', 'puddle', state), state);
    expect(state.has('crowbar')).toBe(true);

    run(clickHotspot('dock_exterior', 'seal', state), state);
    expect(state.has('customs_seal')).toBe(true);

    run(clickHotspot('dock_exterior', 'cigarette', state), state);
    expect(state.has('mint_cigarette')).toBe(true);

    // 徒手撬不动通风口
    expect(run(clickHotspot('dock_exterior', 'vent', state), state)).toBeNull();
    expect(state.hasFlag('vent_opened')).toBe(false);

    // 持撬棍进集装箱
    expect(run(clickHotspot('dock_exterior', 'vent', state, 'crowbar'), state)).toBe(
      'container_interior',
    );
    expect(state.hasFlag('vent_opened')).toBe(true);

    // 这时还没找全 → 「要不要再找找？」
    expect(chapterDone(0, state)).toBe(false);
    expect(run(clickHotspot('dock_exterior', 'zhou', state), state)).toBeNull();
    expect(state.hasFlag('zhou_talked')).toBe(true);

    // ── 场景 2：集装箱内部 ──
    run(clickHotspot('container_interior', 'crates', state, 'crowbar'), state);
    expect(state.has('altered_manifest')).toBe(true);

    run(clickHotspot('container_interior', 'wall', state), state);
    expect(state.has('cut_mark')).toBe(true);

    run(clickHotspot('container_interior', 'cache', state, 'crowbar'), state);
    expect(state.has('bronze_emblem')).toBe(true);
    expect(state.has('ivory_sample')).toBe(true);
    expect(state.hasFlag('cache_opened')).toBe(true);

    // 回码头
    expect(run(clickHotspot('container_interior', 'back_out', state), state)).toBe('dock_exterior');

    // ── 收集齐了 ──
    expect(chapterDone(0, state)).toBe(true);
    expect(state.keyCount).toBe(1); // 只找到铜徽（警号牌在第二章）
    expect(state.clueCount).toBe(3); // 夹层切割痕迹 / 薄荷烟蒂 / 涂改提货单

    // 再点老周 → 收尾台词 + 章节卡
    const clear = clickHotspot('dock_exterior', 'zhou', state);
    const advance = (clear ?? []).find((e) => e.t === 'advanceChapter');
    expect(advance).toBeDefined();
    expect(advance!.t === 'advanceChapter' && advance!.to).toBe(1);
  });

  it('每个 goto 抵达的场景都能被 init 认出来', () => {
    for (const s of ALL) {
      for (const e of allEffects(s)) {
        if (e.t === 'goto') expect(SCENES[e.scene]).toBeDefined();
      }
    }
    for (const [, sceneId] of Object.entries(CHAPTER_FIRST_SCENE)) {
      expect(SCENES[sceneId], `CHAPTER_FIRST_SCENE → ${sceneId}`).toBeDefined();
    }
  });
});

/**
 * 道具栏的排列方式。
 *
 * 这一条是踩过坑才补上的：道具栏原先按「关键道具 → 线索 → 工具 → 物证」排，
 * 结果每捡到一件东西，整条栏都会平移 —— 玩家点「撬棍」的瞬间它正好挪到隔壁，
 * 于是选中的是别的东西，接下来对着木箱堆点半天毫无反应。
 * 现在改成按获得先后追加，已有格子的位置永不改变。
 */
describe('道具栏顺序', () => {
  it('已获得的道具按获得先后排列，新道具追加在末尾', () => {
    const s = new GameState();
    expect(s.owned()).toEqual([]);

    s.addItem('crowbar');
    s.addItem('customs_seal');
    s.addItem('mint_cigarette');
    expect(s.owned()).toEqual(['crowbar', 'customs_seal', 'mint_cigarette']);

    // 新道具不会插到前面去，前面三件的位置原封不动
    s.addItem('bronze_emblem');
    expect(s.owned()).toEqual(['crowbar', 'customs_seal', 'mint_cigarette', 'bronze_emblem']);
  });

  it('重复获得同一件道具不会产生第二个格子', () => {
    const s = new GameState();
    s.addItem('crowbar');
    expect(s.addItem('crowbar')).toBe(false);
    expect(s.owned()).toEqual(['crowbar']);
  });

  it('存档往返后顺序不变', () => {
    const s = new GameState();
    s.addItem('mint_cigarette');
    s.addItem('crowbar');
    s.addItem('customs_seal');

    const restored = new GameState();
    restored.restore(s.snapshot());
    expect(restored.owned()).toEqual(['mint_cigarette', 'crowbar', 'customs_seal']);
  });
});

/**
 * 撬棍的两处用法：木箱堆与夹层暗格都要求「手里拿着撬棍」。
 * 空手点必须只给一句台词、不给道具 —— 否则玩家可以绕过工具直接拿走证据，
 * 后面「没有撬棍」的分支文案就永远看不到了。
 */
describe('工具依赖', () => {
  it('空手点木箱堆：只有台词，没有提货单', () => {
    const s = new GameState();
    const effects = clickHotspot('container_interior', 'crates', s);
    run(effects, s);

    expect(s.has('altered_manifest')).toBe(false);
    expect(s.hasFlag('crates_opened')).toBe(false);
    expect(effects?.some((e) => e.t === 'say')).toBe(true);
  });

  it('拿着撬棍点木箱堆：给出提货单并展示文档', () => {
    const s = new GameState();
    s.addItem('crowbar');
    const effects = clickHotspot('container_interior', 'crates', s, 'crowbar');
    run(effects, s);

    expect(s.has('altered_manifest')).toBe(true);
    expect(s.hasFlag('crates_opened')).toBe(true);
    expect(effects?.some((e) => e.t === 'openDoc' && e.doc === 'manifest')).toBe(true);
  });

  it('没发现切割痕迹时，暗格不成立（点击落到下面的内壁上）', () => {
    const s = new GameState();
    s.addItem('crowbar');
    expect(clickHotspot('container_interior', 'cache', s, 'crowbar')).toBeNull();
  });

  it('发现切割痕迹但空手点暗格：说手指伸不进去，不给铜徽', () => {
    const s = new GameState();
    s.addItem('crowbar');
    run(clickHotspot('container_interior', 'wall', s), s); // 拿到切割痕迹与标记位

    const effects = clickHotspot('container_interior', 'cache', s);
    run(effects, s);
    expect(s.has('bronze_emblem')).toBe(false);
  });

  it('发现切割痕迹 + 拿着撬棍：撬出铜徽与象牙样本并触发闪回', () => {
    const s = new GameState();
    s.addItem('crowbar');
    // 必须先真的点过内壁：解锁暗格的是 cut_mark_found 这个标记位，
    // 光把「夹层切割痕迹」塞进背包不算（两者在真实流程里由同一分支给出）
    run(clickHotspot('container_interior', 'wall', s), s);
    expect(s.hasFlag('cut_mark_found')).toBe(true);

    const effects = clickHotspot('container_interior', 'cache', s, 'crowbar');
    run(effects, s);
    expect(s.has('bronze_emblem')).toBe(true);
    expect(s.has('ivory_sample')).toBe(true);
    expect(s.hasFlag('cache_opened')).toBe(true);
    expect(effects?.some((e) => e.t === 'flashback')).toBe(true);
  });
});

/** 场景里所有会执行到的效果（含 onEnter 与全部分支） */
function allEffects(s: SceneDef): readonly Effect[] {
  return [
    ...(s.onEnter ?? []),
    ...s.hotspots.flatMap((h) => h.branches.flatMap((b) => b.effects)),
  ];
}
