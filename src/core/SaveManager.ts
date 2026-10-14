/**
 * 存档 —— localStorage。
 * 只存「已解锁结局 + 当前进度快照」；不做章节跳转（证据链是连续的）。
 */

import { SAVE_KEY } from '../config';
import { ENDING_ORDER, type EndingId } from '../data/endings';
import type { GameSnapshot } from './GameState';

export interface SaveData {
  readonly version: 1;
  /** 已解锁的结局（图鉴用） */
  readonly unlockedEndings: readonly EndingId[];
  /** 当前进度；null = 还没开始 */
  readonly progress: GameSnapshot | null;
}

const EMPTY: SaveData = { version: 1, unlockedEndings: [], progress: null };

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
}

export function load(): SaveData {
  const s = storage();
  if (!s) return EMPTY;
  try {
    const raw = s.getItem(SAVE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.version !== 1) return EMPTY;
    return {
      version: 1,
      unlockedEndings: (parsed.unlockedEndings ?? []).filter((e): e is EndingId =>
        ENDING_ORDER.includes(e as EndingId),
      ),
      progress: parsed.progress ?? null,
    };
  } catch {
    return EMPTY;
  }
}

export function save(data: SaveData): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* 隐私模式 / 配额满：静默降级，不影响游戏 */
  }
}

/** 解锁一个结局并落盘 */
export function unlockEnding(ending: EndingId, progress: GameSnapshot | null): SaveData {
  const cur = load();
  const unlocked = cur.unlockedEndings.includes(ending)
    ? cur.unlockedEndings
    : [...cur.unlockedEndings, ending];
  const next: SaveData = { version: 1, unlockedEndings: unlocked, progress };
  save(next);
  return next;
}

export function saveProgress(progress: GameSnapshot | null): SaveData {
  const cur = load();
  const next: SaveData = { ...cur, progress };
  save(next);
  return next;
}

export function clearProgress(): SaveData {
  const cur = load();
  const next: SaveData = { ...cur, progress: null };
  save(next);
  return next;
}

export function resetAll(): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function isUnlocked(ending: EndingId): boolean {
  return load().unlockedEndings.includes(ending);
}
