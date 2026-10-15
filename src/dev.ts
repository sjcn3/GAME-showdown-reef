/**
 * 开发期调试钩子
 *
 * 只在 URL 带 `?dev=1` 时挂到 `window.__anJiao`，正式游玩时不存在。
 * 两个用途：
 *   1. 自动化烟测（tools/smoke.mjs 的 eval 步骤）能直接读状态、跳场景，
 *      不必靠「盲点 N 下」去猜对话有没有走完；
 *   2. 手工开发时 `__anJiao.goto('container_interior')` 直接进某张场景核对画面。
 */

import Phaser from 'phaser';

import { CHAPTER_FIRST_SCENE, SCENES } from './data/chapters';
import { ALL_ITEM_IDS, ITEMS, type ItemId } from './data/items';
import { ENDINGS, type EndingId } from './data/endings';
import type { GameState } from './core/GameState';
import { load, resetAll, unlockEnding } from './core/SaveManager';
import { clearSfxHistory, sfxHistory } from './core/Sfx';
import { gameState } from './store';

export interface DevApi {
  /** Phaser 游戏实例，排查输入 / 场景状态时用 */
  readonly game: Phaser.Game;
  /** 当前处于运行中的场景 key */
  active(): string[];
  /** 上一次指针事件的场景坐标与是否已触发 pointerdown */
  pointer(): { x: number; y: number; downX: number; downY: number };
  /** 当前状态对象本身（只读用） */
  readonly state: GameState;
  /** 全部场景数据 */
  readonly scenes: typeof SCENES;
  /** 手上已有的道具 id */
  items(): ItemId[];
  /** 已有道具的中文名，截图核对时更直观 */
  names(): string[];
  keyCount(): number;
  clueCount(): number;
  flags(): string[];
  /** 直接发道具，用来把状态摆到某一章的半途 */
  give(...ids: ItemId[]): string[];
  /** 某件道具在道具栏里的页面坐标（未持有返回 null） */
  itemCell(id: ItemId): { x: number; y: number } | null;
  /** 当前手持的道具（没选中返回 null） */
  held(): ItemId | null;
  /** 当前场景里某个热点的中心页面坐标（供脚本按名字点击，不写死坐标） */
  hotspot(id: string): { x: number; y: number } | null;
  /** 当前所在场景 id */
  scene(): string;
  /** 密码盘开着时返回「按键文字 → 页面坐标」，没开返回 null */
  padKeys(): Record<string, { x: number; y: number }> | null;
  /** 场景是否已安静（没有对话框/章节卡/文档浮层/证据列表、也不忙） */
  idle(): IdleInfo | null;
  /** 当前场景里一块空地的页面坐标，点它只会推进对话（不落在任何热点上） */
  neutral(): { x: number; y: number } | null;
  /** 标题页某个按钮的页面坐标（按文字取，例如「开始调查」）；不在标题页返回 null */
  titleButton(text: string): { x: number; y: number } | null;
  /**
   * 标题页的制作信息面板开着没有。不在标题页返回 null ——
   * 把「不在这屏」和「在这屏但关着」分开，断言才不会恒真。
   */
  titleCredits(): boolean | null;
  /** 画布正中的页面坐标 —— 给「点哪都行」的画面（序章）用，别写死坐标 */
  center(): { x: number; y: number };
  /**
   * 对峙场景的状态：当前回合、轮不轮到玩家出牌、三个目标中心。
   * 不在对峙场景时返回 null。坐标同样由页面给，脚本不写死。
   */
  confront(): ConfrontInfo | null;
  /** 结局屏上判出来的结局（不在结局屏时为 null） */
  ending(): EndingInfo | null;
  /** 存档里已解锁的结局 id（不依赖当前停在哪一屏） */
  unlocked(): string[];
  /** 图鉴这一屏自己认为解锁了什么（不在图鉴屏时为 null） */
  gallery(): { unlocked: string[]; total: number } | null;
  /** 直接解锁若干结局，用来把图鉴摆成想要的样子（会写存档） */
  unlock(...ids: EndingId[]): string[];
  /** 清空存档（图鉴归零），用来反复验"第一局" */
  wipeSave(): string;
  /** 跳到任意已注册的场景（Title / Gallery / Debug / Explore …） */
  screen(key: string): string;
  /**
   * 把结局屏钉在指定结局上并跳过去（不写存档）。
   * 六个结局的插画是六张不同的画，没有这个口子就只能靠"凑道具凑出某个结局"
   * 来一张张截图 —— 凑不出来的那几张就永远没人看过。
   */
  plate(id: EndingId): EndingId;
  /** 最近响过哪些音效 cue（新的在后） */
  sfx(): string[];
  /** 清空音效记录，好让每一段断言只看自己那几步 */
  clearSfx(): string;
  /** 跳到某个探索场景（会重置当前场景的实例，不动 state） */
  goto(sceneId: string): string;
  /**
   * 在当前探索场景里直接弹一次章节卡（不写 state，不推进章节）。
   * 章节卡只在 advanceChapter 里出现，而推进章节要么得凑齐道具、
   * 要么得点完一整段对话 —— 三张卡就是三条完整路线。有了这个口子，
   * 三张卡各自的版面一次就能截全。
   */
  chapterCard(index: number): boolean | null;
  /** 回到第一章开头并清空状态 */
  restart(): string;
  /**
   * 道具栏左上角「证据」按钮的页面坐标（C1）。
   * 不在探索/对峙场景时返回 null。
   */
  evidenceButton(): { x: number; y: number } | null;
  /**
   * 证据列表打开时的行中心点（键是道具名）与关闭按钮位置（C1）。
   * 列表没开返回 null —— 脚本因此知道"点开了没有"，不必靠截图猜。
   */
  evidenceRows(): { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null;
  /**
   * 右上角返回按钮的中心点，以及它是不是正等着第二下（C2）。
   * 不在探索/对峙场景时返回 null。
   */
  back(): { x: number; y: number; armed: boolean } | null;
  /**
   * 本场景累计弹出过多少个点击反馈环（C3）。场景切走后清零。
   * 不在探索/对峙场景时返回 null。
   */
  ripples(): number | null;
}

/**
 * 场景"安静了没有"。
 *
 * `evidence` 与 `backArmed` 是 C1/C2 之后加的：证据列表虽然也吃点击，
 * 但它不算 busy —— 少了这两项，settle 会以为场景已经安静，
 * 对着一个开着的列表继续点，把列表当成场景在推。
 */
export interface IdleInfo {
  readonly busy: boolean;
  readonly textBox: boolean;
  readonly card: boolean;
  readonly doc: boolean;
  readonly evidence: boolean;
  readonly backArmed: boolean;
}

/** 标题页给开发钩子的口子。 */
export interface TitleQuery {
  readonly devButtons: Record<string, { x: number; y: number }>;
  /** 制作信息面板开着没有。必须是方法 —— 属性会在挂钩子那一刻定格成旧值 */
  devCreditsOpen(): boolean;
}

export interface ConfrontInfo {
  readonly round: string;
  readonly waiting: boolean;
  readonly textBox: boolean;
  readonly evidence: boolean;
  readonly doc: boolean;
  readonly fumbleCount: number;
  readonly targets: Readonly<Record<string, { x: number; y: number }>>;
  readonly neutral: { x: number; y: number };
}

export interface EndingInfo {
  readonly id: string;
  readonly name: string;
  readonly base: string;
  readonly downgraded: boolean;
  readonly forcedWorst: boolean;
  readonly keyCount: number;
  readonly clueCount: number;
  readonly fumbleCount: number;
}

/** ExploreScene 对外只暴露这几个查询方法，用它避开对私有字段的乱翻。 */
interface ExploreQuery {
  devInventory?: () => {
    held: ItemId | null;
    cellCenterOf: (id: ItemId) => { x: number; y: number } | null;
  };
  devHotspot?: (id: string) => { x: number; y: number } | null;
  devScene?: () => string;
  devPadKeys?: () => Record<string, { x: number; y: number }> | null;
  devIdle?: () => IdleInfo;
  devNeutral?: () => { x: number; y: number };
  devRefresh?: () => void;
  devEvidenceButton?: () => { x: number; y: number };
  devEvidenceRows?: () => { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null;
  devBack?: () => { x: number; y: number; armed: boolean };
  devRippleCount?: () => number;
  /** 直接弹一次章节卡（烟测专用，不推进章节） */
  devChapterCard?: (index: number) => boolean;
}

/** ConfrontationScene 同样只开一个查询口 */
interface ConfrontQuery {
  devConfront?: () => ConfrontInfo;
  devInventory?: () => {
    held: ItemId | null;
    cellCenterOf: (id: ItemId) => { x: number; y: number } | null;
  };
  devRefresh?: () => void;
  devEvidenceButton?: () => { x: number; y: number };
  devEvidenceRows?: () => { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null;
  devBack?: () => { x: number; y: number; armed: boolean };
  devRippleCount?: () => number;
}

/** EndingScene：让脚本能读出「到底判成了哪个结局」 */
interface EndingQuery {
  devEnding?: () => {
    id: string;
    name: string;
    base: string;
    downgraded: boolean;
    forcedWorst: boolean;
    keyCount: number;
    clueCount: number;
    fumbleCount: number;
  };
}

/** GalleryScene：让脚本能读出「图鉴这一屏认为解锁了什么」 */
interface GalleryQuery {
  devGallery?: () => { unlocked: string[]; total: number };
}

export function installDevHook(
  game: Phaser.Game,
  startExplore: (sceneId: string) => void,
): void {
  if (!new URLSearchParams(window.location.search).has('dev')) return;

  const explore = (): (Phaser.Scene & ExploreQuery) | undefined =>
    game.scene.isActive('Explore')
      ? (game.scene.getScene('Explore') as Phaser.Scene & ExploreQuery)
      : undefined;

  const confrontScene = (): (Phaser.Scene & ConfrontQuery) | undefined =>
    game.scene.isActive('Confrontation')
      ? (game.scene.getScene('Confrontation') as Phaser.Scene & ConfrontQuery)
      : undefined;

  const titleScene = (): (Phaser.Scene & TitleQuery) | undefined =>
    game.scene.isActive('Title') ? (game.scene.getScene('Title') as Phaser.Scene & TitleQuery) : undefined;

  /**
   * 道具栏查询口。探索场景与对峙场景各有一个，形状相同 ——
   * `hold-item` / `click-item` 因此不必知道自己在哪一幕里。
   */
  const inv = () => explore()?.devInventory?.() ?? confrontScene()?.devInventory?.();

  /**
   * 画布在页面里的实际位置与大小。
   * `Scale.FIT` 会把 720×1280 的舞台缩放居中，所以「游戏坐标」与「页面坐标」
   * 只在正好 720×1280 的窗口里才相等。
   */
  const canvasRect = (): { x: number; y: number; width: number; height: number } => {
    const r = game.canvas?.getBoundingClientRect?.();
    if (r && r.width > 0 && r.height > 0) {
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    }
    return { x: 0, y: 0, width: game.scale.width, height: game.scale.height };
  };

  /**
   * 游戏坐标 → 页面坐标。
   *
   * 凡是「给脚本去点」的坐标都必须过这一道。烟测脚本拿游戏坐标直接派发事件，
   * 在手机尺寸的窗口里会点在画布外面 —— 而「点空了」和「游戏坏了」
   * 在报告里长得一模一样，最后查半天查的是自己的脚本。
   */
  const toPage = (p: { x: number; y: number } | null): { x: number; y: number } | null => {
    if (!p) return null;
    const r = canvasRect();
    return {
      x: Math.round(r.x + (p.x * r.width) / game.scale.width),
      y: Math.round(r.y + (p.y * r.height) / game.scale.height),
    };
  };

  const toPageMap = (
    m: Record<string, { x: number; y: number }> | null,
  ): Record<string, { x: number; y: number }> | null => {
    if (!m) return null;
    const out: Record<string, { x: number; y: number }> = {};
    for (const [k, v] of Object.entries(m)) {
      const p = toPage(v);
      if (p) out[k] = p;
    }
    return out;
  };

  const api: DevApi = {
    game,
    active: () => game.scene.getScenes(true).map((s) => s.scene.key),
    pointer: () => ({
      x: game.input.activePointer.x,
      y: game.input.activePointer.y,
      downX: game.input.activePointer.downX,
      downY: game.input.activePointer.downY,
    }),
    state: gameState,
    scenes: SCENES,
    items: () => ALL_ITEM_IDS.filter((id) => gameState.has(id)),
    names: () => ALL_ITEM_IDS.filter((id) => gameState.has(id)).map((id) => ITEMS[id].name),
    keyCount: () => gameState.keyCount,
    clueCount: () => gameState.clueCount,
    flags: () => [...gameState.flags],
    give: (...ids) => {
      const added = ids.filter((id) => gameState.addItem(id));
      // 直接改 state 不会让道具栏自己更新：不补这一次重画，界面上就没有新格子，
      // 紧接着的 hold-item / click-item 会点在空气上，而报告仍然全绿。
      (explore() ?? confrontScene())?.devRefresh?.();
      return added;
    },
    itemCell: (id) => toPage(inv()?.cellCenterOf(id) ?? null),
    held: () => inv()?.held ?? null,
    hotspot: (id) => toPage(explore()?.devHotspot?.(id) ?? null),
    scene: () => explore()?.devScene?.() ?? '',
    padKeys: () => toPageMap(explore()?.devPadKeys?.() ?? null),
    idle: () => explore()?.devIdle?.() ?? null,
    neutral: () => toPage(explore()?.devNeutral?.() ?? null),
    titleButton: (text) => toPage(titleScene()?.devButtons?.[text] ?? null),
    titleCredits: () => titleScene()?.devCreditsOpen?.() ?? null,
    center: () => {
      const r = canvasRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
    },
    confront: () => {
      const c = confrontScene()?.devConfront?.();
      if (!c) return null;
      return {
        ...c,
        targets: toPageMap(c.targets) ?? {},
        neutral: toPage(c.neutral) ?? c.neutral,
      };
    },
    ending: () => {
      if (!game.scene.isActive('Ending')) return null;
      const s = game.scene.getScene('Ending') as Phaser.Scene & EndingQuery;
      return s.devEnding?.() ?? null;
    },
    goto: (sceneId) => {
      if (!SCENES[sceneId]) throw new Error(`没有这个场景：${sceneId}`);
      startExplore(sceneId);
      return sceneId;
    },
    unlocked: () => [...load().unlockedEndings],
    gallery: () => {
      if (!game.scene.isActive('Gallery')) return null;
      const s = game.scene.getScene('Gallery') as Phaser.Scene & GalleryQuery;
      return s.devGallery?.() ?? null;
    },
    unlock: (...ids) => {
      for (const id of ids) unlockEnding(id);
      return [...load().unlockedEndings];
    },
    wipeSave: () => {
      resetAll();
      return 'save cleared';
    },
    chapterCard: (index) => explore()?.devChapterCard?.(index) ?? null,
    screen: (key) => {
      if (!game.scene.keys[key]) throw new Error(`没有这个场景 key：${key}`);
      for (const s of game.scene.getScenes(true)) {
        if (s.scene.key !== key) s.scene.stop();
      }
      game.scene.start(key);
      return key;
    },
    plate: (id) => {
      if (!ENDINGS[id]) throw new Error(`没有这个结局：${id}`);
      for (const s of game.scene.getScenes(true)) {
        if (s.scene.key !== 'Ending') s.scene.stop();
      }
      game.scene.start('Ending', {
        resolved: gameState.resolve(),
        preview: true,
        forceEnding: id,
      });
      return id;
    },
    sfx: () => [...sfxHistory()],
    clearSfx: () => {
      clearSfxHistory();
      return 'cleared';
    },
    restart: () => {
      gameState.reset();
      const first = CHAPTER_FIRST_SCENE[0]!;
      startExplore(first);
      return first;
    },
    evidenceButton: () => toPage((explore() ?? confrontScene())?.devEvidenceButton?.() ?? null),
    evidenceRows: () => {
      const r = (explore() ?? confrontScene())?.devEvidenceRows?.();
      if (!r) return null;
      const close = toPage(r.close);
      if (!close) return null;
      return { rows: toPageMap(r.rows) ?? {}, close };
    },    back: () => {
      const b = (explore() ?? confrontScene())?.devBack?.();
      if (!b) return null;
      const p = toPage(b);
      return p ? { ...p, armed: b.armed } : null;
    },
    ripples: () => (explore() ?? confrontScene())?.devRippleCount?.() ?? null,
  };

  (window as unknown as { __anJiao: DevApi }).__anJiao = api;
  console.log('[dev] window.__anJiao 已挂载');
}
