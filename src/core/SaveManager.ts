/**
 * 存档 —— localStorage。
 * 存三样：已解锁结局、当前进度快照、**进度停在哪个场景**。
 * 不做章节跳转（证据链是连续的）。
 */

import { SAVE_KEY } from '../config';
import { ENDING_ORDER, type EndingId } from '../data/endings';
import type { GameSnapshot } from './GameState';

/**
 * 一次「还在进行中的调查」。
 *
 * 除了状态快照，还必须记**当时在哪个场景** —— 快照里没有场景，
 * 而「回到走廊接着查」和「回到码头」是两局完全不同的游戏。
 * 只存快照的话，续玩只能从第一章重开，等于没续。
 */
export interface Progress {
  readonly sceneId: string;
  readonly snapshot: GameSnapshot;
}

export interface SaveData {
  readonly version: 1;
  /** 已解锁的结局（图鉴用） */
  readonly unlockedEndings: readonly EndingId[];
  /** 当前进度；null = 没有进行中的调查 */
  readonly progress: Progress | null;
}

const EMPTY: SaveData = { version: 1, unlockedEndings: [], progress: null };

/**
 * 进度块的结构校验。
 *
 * 早期版本的 `progress` 直接就是一个 `GameSnapshot`（没有 `sceneId`），
 * 在这里被挡掉、退回「没有进度」—— 宁可让玩家从头开一局，
 * 也不能拿着一个缺字段的对象去 `restore`，那会在某个场景里炸出一片空白。
 */
function isProgress(v: unknown): v is Progress {
  if (typeof v !== 'object' || v === null) return false;
  const p = v as Partial<Progress>;
  return (
    typeof p.sceneId === 'string' &&
    p.sceneId.length > 0 &&
    typeof p.snapshot === 'object' &&
    p.snapshot !== null
  );
}

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
      progress: isProgress(parsed.progress) ? parsed.progress : null,
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

/**
 * 解锁一个结局并落盘。
 *
 * **顺手把进度清掉**：走到结局就是这一局打完了，标题页下次应该给「开始调查」，
 * 而不是给一个「继续调查」把你送回仓库门口 —— 那条路已经走完了。
 */
export function unlockEnding(ending: EndingId): SaveData {
  const cur = load();
  const unlocked = cur.unlockedEndings.includes(ending)
    ? cur.unlockedEndings
    : [...cur.unlockedEndings, ending];
  const next: SaveData = { version: 1, unlockedEndings: unlocked, progress: null };
  save(next);
  return next;
}

/**
 * 记一个存档点。每进入一个探索场景调一次（见 `ExploreScene.create`）。
 *
 * 调用方负责在 `markVisited` **之后**调 —— 这样快照里的 `visited` 已经含当前场景，
 * 续玩时的处理才自洽（见 `GameState.forgetVisited`）。
 */
export function saveProgress(sceneId: string, snapshot: GameSnapshot): SaveData {
  const cur = load();
  const next: SaveData = { ...cur, progress: { sceneId, snapshot } };
  save(next);
  return next;
}

export function clearProgress(): SaveData {
  const cur = load();
  if (!cur.progress) return cur;
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
