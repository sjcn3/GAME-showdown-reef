import { beforeEach, describe, expect, it } from 'vitest';

import { SAVE_KEY } from '../src/config';
import { GameState } from '../src/core/GameState';
import { clearProgress, load, resetAll, saveProgress, unlockEnding } from '../src/core/SaveManager';

/** node 环境没有 localStorage，用 Map 顶一个，行为够用 */
class MemStorage {
  private readonly m = new Map<string, string>();
  get length(): number {
    return this.m.size;
  }
  clear(): void {
    this.m.clear();
  }
  getItem(k: string): string | null {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  key(i: number): string | null {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.m.delete(k);
  }
  setItem(k: string, v: string): void {
    this.m.set(k, String(v));
  }
}

const setRaw = (v: unknown): void => {
  localStorage.setItem(SAVE_KEY, JSON.stringify(v));
};

beforeEach(() => {
  (globalThis as { localStorage?: Storage }).localStorage = new MemStorage() as unknown as Storage;
});

describe('存档 · 续玩进度', () => {
  it('saveProgress 把场景与快照一起存下，load 读得回来', () => {
    const s = new GameState();
    s.addItem('bronze_emblem');
    s.setFlag('crates_opened');
    s.markVisited('captain_cabin');

    saveProgress('captain_cabin', s.snapshot());

    const p = load().progress;
    expect(p).not.toBeNull();
    // 快照里没有"在哪个场景"—— 这正是 Progress 必须带上 sceneId 的原因
    expect(p!.sceneId).toBe('captain_cabin');
    expect(p!.snapshot.items).toEqual(['bronze_emblem']);
    expect(p!.snapshot.flags).toEqual(['crates_opened']);
  });

  it('restore 之后 visited 也回来了 —— 所以续玩必须先 forgetVisited 才进场景', () => {
    const s = new GameState();
    s.addItem('crowbar');
    s.markVisited('dock_exterior');
    s.markVisited('captain_cabin');
    saveProgress('captain_cabin', s.snapshot());

    const back = new GameState();
    back.restore(load().progress!.snapshot);

    expect(back.owned()).toEqual(['crowbar']);
    expect(back.hasFlag('crates_opened')).toBe(false);
    // 没有 forgetVisited 的话，markVisited 返回 false → onEnter 不播
    expect(back.markVisited('captain_cabin')).toBe(false);
    back.forgetVisited('captain_cabin');
    expect(back.markVisited('captain_cabin')).toBe(true);
  });

  it('走到结局 → 进度清掉，已解锁结局留着', () => {
    saveProgress('corridor', new GameState().snapshot());
    unlockEnding('tide_ebb');

    const d = load();
    expect(d.progress).toBeNull();
    expect(d.unlockedEndings).toEqual(['tide_ebb']);
  });

  it('clearProgress 只清进度，不动已解锁结局', () => {
    unlockEnding('tide_ebb');
    saveProgress('corridor', new GameState().snapshot());
    clearProgress();

    const d = load();
    expect(d.progress).toBeNull();
    expect(d.unlockedEndings).toEqual(['tide_ebb']);
  });

  it('老格式的 progress（裸快照、没有 sceneId）被挡掉，退回"没有进度"', () => {
    setRaw({ version: 1, unlockedEndings: [], progress: { items: ['crowbar'] } });
    expect(load().progress).toBeNull();
  });

  it('sceneId 是空串也算没有进度', () => {
    setRaw({ version: 1, unlockedEndings: [], progress: { sceneId: '', snapshot: { items: [] } } });
    expect(load().progress).toBeNull();
  });

  it('不认识的结局 id 被过滤掉，不污染图鉴', () => {
    setRaw({ version: 1, unlockedEndings: ['tide_ebb', 'bogus'], progress: null });
    expect(load().unlockedEndings).toEqual(['tide_ebb']);
  });

  it('版本号对不上 → 整份作废', () => {
    setRaw({ version: 2, unlockedEndings: ['tide_ebb'], progress: null });
    expect(load().unlockedEndings).toEqual([]);
  });

  it('存档不是合法 JSON 也不炸，退回空档', () => {
    localStorage.setItem(SAVE_KEY, '{ 这不是 json');
    expect(load().progress).toBeNull();
    expect(load().unlockedEndings).toEqual([]);
  });

  it('resetAll 之后一切归零', () => {
    saveProgress('corridor', new GameState().snapshot());
    unlockEnding('tide_ebb');
    resetAll();

    const d = load();
    expect(d.progress).toBeNull();
    expect(d.unlockedEndings).toEqual([]);
  });
});
