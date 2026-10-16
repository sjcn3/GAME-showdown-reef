/**
 * 通用探索场景（数据驱动）—— 设计文档 11.2 的「解释器」
 *
 * 一个场景类吃掉全部 8 张场景：画面由 SceneDef.paintKey 查表画，点击由 SceneDef.hotspots 决定。
 * 加场景 = 往 data/chapters.ts 里加一条数据，不用改这里。
 *
 * 分工：
 *   data/chapters.ts  剧情 / 条件 / 效果  ←→  本文件  把 Effect 变成画面与状态变化
 *   core/Story.ts     纯类型 + 纯函数（可脱离 Phaser 单测）
 */

import Phaser from 'phaser';

import { COLORS, FLASHBACK_MS, GAME_HEIGHT, GAME_WIDTH, STAGE_HEIGHT } from '../config';
import {
  CHAPTER_FIRST_SCENE,
  SCENES,
  chapterDone,
  CHAPTERS,
} from '../data/chapters';
import { DOCS } from '../data/documents';
import { ITEMS, type ItemId } from '../data/items';
import { preloadSfx, playSfx } from '../core/Sfx';
import { saveProgress } from '../core/SaveManager';
import { gameState } from '../store';
import { hits, pickBranch, type Ctx, type DocId, type Effect, type SceneDef } from '../core/Story';
import { addSceneFigures, PLACEHOLDER_PAINT } from '../art/placeholders';
import { addSceneAmbient } from '../art/sceneAmbient';
import { BackButton } from '../ui/BackButton';
import { ChapterCard } from '../ui/ChapterCard';
import { DocumentOverlay } from '../ui/DocumentOverlay';
import { EvidenceLog } from '../ui/EvidenceLog';
import { InventoryBar } from '../ui/InventoryBar';
import { PasswordPad } from '../ui/PasswordPad';
import { TextBox } from '../ui/TextBox';
import { Toast } from '../ui/Toast';
import { TutorialButton } from '../ui/TutorialButton';
import { TutorialPanel } from '../ui/TutorialPanel';
import { FONT_SANS } from '../ui/theme';

/** 场景切换的淡入淡出时长（C4）。硬切在手机上像是画面闪了一下。 */
const FADE_MS = 200;

interface ExploreData {
  readonly sceneId?: string;
}

export class ExploreScene extends Phaser.Scene {
  private def!: SceneDef;
  private textBox!: TextBox;
  private toast!: Toast;
  private bar!: InventoryBar;
  private doc!: DocumentOverlay;
  private card!: ChapterCard;
  private pad!: PasswordPad;
  private evidence!: EvidenceLog;
  private back!: BackButton;
  private tutorial!: TutorialPanel;
  private tutorialBtn!: TutorialButton;
  /** 场景底图。留着引用是为了捡到东西之后能整张重画（X3）。 */
  private art!: Phaser.GameObjects.Graphics;

  /** 有阻塞式效果在跑（防止连点触发两次剧情） */
  private busy = false;
  /** 「要不要再找找？」同一个热点只提示一次，第二次点才真的推进 */
  private readonly hinted = new Set<string>();

  private debug = false;
  private debugLayer?: Phaser.GameObjects.Container;
  /** 累计弹出过多少个点击反馈环（C3）—— 只给开发钩子断言用 */
  private rippleCount = 0;

  constructor() {
    super('Explore');
  }

  init(data: ExploreData): void {
    const fallback = CHAPTER_FIRST_SCENE[0]!;
    this.def = SCENES[data.sceneId ?? fallback] ?? SCENES[fallback]!;
    this.busy = false;
    this.rippleCount = 0;
    this.hinted.clear();
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.art = this.add.graphics();
    this.paintScene();

    // 第 2 组 B1/B2：会下的雨、会呼吸的灯、会晃的水面、会飘的尘埃。
    // 挂在这一层是安全的 —— 动效层深度 20~24，在所有 UI（400 起）之下。
    addSceneAmbient(this, this.def.paintKey);
    // 第 2 组 B5：人物独立成层，各自待机呼吸（深度 10，压在雨和尘埃后面）
    addSceneFigures(this, this.def.paintKey);

    this.textBox = new TextBox(this);
    this.evidence = new EvidenceLog(this, (id) => void this.reread(id));
    this.bar = new InventoryBar(
      this,
      () => this.refreshBar(),
      () => this.evidence.open(gameState),
    );
    this.toast = new Toast(this);
    this.doc = new DocumentOverlay(this);
    this.card = new ChapterCard(this);
    this.pad = new PasswordPad(this);
    this.back = new BackButton(
      this,
      () => this.covered(),
      () => this.scene.start('Title'),
    );
    this.tutorial = new TutorialPanel(this);
    this.tutorialBtn = new TutorialButton(
      this,
      () => this.covered(),
      () => this.tutorial.open(),
    );

    this.bar.refresh(gameState);
    this.wireInput();
    // 和 goto 前的 fadeOut 接上（C4）：下一幕从黑里浮出来，而不是"啪"地换一张
    this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);

    const firstVisit = gameState.markVisited(this.def.id);

    // 存档点：每进入一个探索场景就落一次盘。
    //
    // 必须放在 markVisited **之后** —— 快照里的 visited 要已经含当前场景。
    // 续玩时 TitleScene 会把当前场景从 visited 里抹掉再进来（见 forgetVisited），
    // 于是 onEnter 正好重播一次，和"第一次走进来"完全一致。
    //
    // 存的是"进场景那一刻"，不是"每一帧"：玩家在场景里做的事（拿道具、翻文档）
    // 都发生在离开这个场景之前，而离开就一定经过另一次 create —— 所以
    // 任何一次进度推进之后，紧接着的那次 create 都会把它记下来。
    saveProgress(this.def.id, gameState.snapshot());

    const queued: Effect[] = firstVisit && this.def.onEnter ? [...this.def.onEnter] : [];
    // 教学挂在开场旁白**之后**：引子还没读完就盖一张面板上去，
    // 玩家第一眼看到的是说明书，不是故事。
    if (queued.length > 0) void this.run(queued).then(() => this.maybeTeach());
    else this.maybeTeach();
  }

  /**
   * 整张重画场景底图（X3）。
   *
   * 场景图是按 `paintKey` 画一次的静态图，而「水里的撬棍」「箱子里的钥匙」
   * 是画在里面的 —— 捡走之后不重画，东西就还留在原地。
   * 画家从 `ctx` 里问一句「这件东西还在不在」，这里负责在状态变了之后
   * 把它再问一遍。
   *
   * 重画的是底图这一层；雨、尘埃、人物都是各自独立的层（`addSceneAmbient`
   * / `addSceneFigures`），不受影响。
   */
  private paintScene(): void {
    const painter = PLACEHOLDER_PAINT[this.def.paintKey];
    if (!painter) {
      console.warn(`[ExploreScene] 场景 ${this.def.id} 没有占位绘制：${this.def.paintKey}`);
      return;
    }
    this.art.clear();
    painter(this.art, GAME_WIDTH, STAGE_HEIGHT, { has: (id) => gameState.has(id) });
  }

  /**
   * 首段旁白之后弹一次玩法教学（X2）。
   *
   * 「只弹一次」靠存档里的 `tutorial_seen`：续玩会重播本章的 onEnter
   * （见 `GameState.forgetVisited`），标记不落盘的话，每次续玩都要
   * 再关一遍同一个面板。
   *
   * 这里必须自己再存一次档：`run()` 的落盘发生在上面的 `.then` 之前，
   * 那次快照里还没有这个标记。
   */
  private maybeTeach(): void {
    if (gameState.hasFlag('tutorial_seen')) return;
    gameState.setFlag('tutorial_seen');
    saveProgress(this.def.id, gameState.snapshot());
    this.tutorial.open();
  }

  // ── 输入 ─────────────────────────────────────────────

  private wireInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.onDown(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      this.doc.pointerMove(p.y);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      this.doc.pointerUp(p.y);
    });

    this.input.keyboard?.on('keydown-H', () => this.toggleDebug());
    this.input.keyboard?.on('keydown-ESC', () => {
      // ESC 先关浮层，再退标题 —— 别一按就把整局丢了
      if (this.evidence.isActive) {
        this.evidence.close();
        return;
      }
      if (!this.busy) this.scene.start('Title');
    });
  }

  private onDown(p: Phaser.Input.Pointer): void {
    // 浮层优先级：教学 > 章节卡 > 密码盘 > 文档 > 文本框（都是从最上面那层开始吃点击）
    if (this.tutorial.isActive) {
      // 同证据列表：关闭由浮层自己的全屏背板判定，这里只负责把点击栏在外面。
      return;
    }
    if (this.card.isActive) {
      this.card.tap();
      return;
    }
    // 密码盘自己用 Phaser 的 interactive 处理按键；这里只负责把点击栏在外面
    if (this.pad.isActive) return;
    if (this.evidence.isActive) {
      // 这里只负责"把点击栏在浮层外面"。浮层自己有一块全屏背板接管关闭 ——
      // 早先是在这里转发 p.y 让它判断"点了面板外"，结果是同一下点击
      // 既打开又立刻关闭（手指落在道具栏上，本来就在面板外）。
      return;
    }
    if (this.doc.isActive) {
      this.doc.pointerDown(p.y);
      return;
    }
    if (this.textBox.isActive) {
      this.textBox.tap();
      return;
    }
    // 右上角返回按钮（C2）：挂 interactive，自己处理"点两下"。
    // 但 Phaser 的对象输入不看深度，所以这里必须替它挡掉 —— 否则浮层开着时
    // 点右上角会既关浮层、又 arm 一次返回。
    if (this.back.hitTest(p.x, p.y)) return;
    // 左上角「?」（X2）：同返回按钮，自己挂 interactive，这里替它挡掉
    if (this.tutorialBtn.hitTest(p.x, p.y)) return;
    if (this.busy) return;

    // 底部道具栏自己处理点击
    if (p.y >= STAGE_HEIGHT) return;

    this.handleStage(p.x, p.y);
  }

  private handleStage(x: number, y: number): void {
    const ctx: Ctx = { state: gameState, held: this.bar.held };
    let onHotspot = false;

    for (const h of this.def.hotspots) {
      if (!hits(h.rect, x, y)) continue;
      onHotspot = true;

      const index = pickBranch(h.branches, ctx);
      // -1 = 这个热点在当前状态下不成立（例如没发现切割痕迹时的暗格），
      //      继续往下找 —— 于是点击自然落到它下面的那个热点上。
      if (index < 0) continue;

      this.ripple(x, y);
      void this.run(h.branches[index]!.effects, h.id);
      playSfx(this, 'hotspot');
      return;
    }

    // 点空白处 = 放下手里的东西
    if (!onHotspot) {
      if (this.bar.held) this.bar.clearSelection();
      return;
    }

    // 点到东西了，但没有任何分支认手里这件道具 —— 必须给个回应，
    // 否则玩家会以为「点了没反应 = 这里没东西」，把线索当成空气。
    if (this.bar.held) {
      this.toast.show(`「${ITEMS[this.bar.held].name}」用在这上面不对。`);
      this.bar.clearSelection();
    }
  }

  private refreshBar(): void {
    this.bar.refresh(gameState);
  }

  /**
   * 点中热点时的一圈轻反馈（C3）。
   *
   * 这些场景本来就压得很暗，点一个和背景同色的东西却没有任何回应时，
   * 玩家分不清"这里没东西"和"我点偏了"。环的寿命只有 300ms，
   * 不进判定、不改状态 —— 它只回答"收到了"。
   */
  private ripple(x: number, y: number): void {
    this.rippleCount += 1;
    const ring = this.add.circle(x, y, 18).setStrokeStyle(2, COLORS.accent, 0.9).setDepth(450);
    ring.setScale(0.4);
    this.tweens.add({
      targets: ring,
      scale: 2.2,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** 换场景/换幕前的淡出（C4）。 */
  private fadeOut(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise<void>((resolve) => {
      this.time.delayedCall(ms, () => resolve());
    });
  }

  /**
   * 重读一份原件（C1）。从证据列表点「重读原件」进来。
   *
   * 中间那一下 wait 是留给列表收起的：文档浮层在 800、证据列表在 780，
   * 不等一帧的话纸面会在列表收起前盖上去，看着像两层糊在一起。
   */
  private async reread(id: DocId): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      this.evidence.close();
      await this.wait(90);
      playSfx(this, 'document');
      await this.doc.show(DOCS[id]);
    } finally {
      this.busy = false;
    }
  }

  /** 有浮层盖着右上角返回按钮（C2）—— 别让它在纸面底下被点到。 */
  private covered(): boolean {
    return (
      this.busy ||
      this.card.isActive ||
      this.pad.isActive ||
      this.evidence.isActive ||
      this.doc.isActive ||
      this.textBox.isActive ||
      this.tutorial.isActive
    );
  }

  /**
   * 「要不要再找找？」闸门：本章收集不全时，同一个热点只提示一次，不执行后续。
   * @returns true = 这次点击被拦下了，只弹了提示
   */
  private holdBack(chapter: number, hotspotId: string | undefined, hint: string): boolean {
    const key = `chapter:${chapter}:${hotspotId ?? ''}`;
    if (chapterDone(chapter, gameState) || this.hinted.has(key)) return false;
    this.hinted.add(key);
    this.toast.show(hint, { emphasis: true });
    playSfx(this, 'searchAgain');
    return true;
  }

  /** 仅供开发钩子（`?dev=1`）查询道具栏用。 */
  devInventory(): {
    held: ItemId | null;
    cellCenterOf: (id: ItemId) => { x: number; y: number } | null;
  } {
    return { held: this.bar.held, cellCenterOf: (id) => this.bar.cellCenterOf(id) };
  }

  /**
   * 仅供开发钩子：按当前 state 把道具栏重画一遍。
   *
   * `__anJiao.give()` 是绕过热点直接改 state 的，界面不会自己更新 ——
   * 于是脚本读到的是「道具已经给了」，画面上却还是一栏空白，
   * 紧接着的 `hold-item` 会点在一个**根本没渲染出来的格子**上，
   * 之后所有依赖手持道具的点击全部静默落空，而报告里每一步都是绿的。
   * 发完东西必须补这一次重画。
   */
  devRefresh(): void {
    this.refreshBar();
  }

  /**
   * 仅供开发钩子：热点矩形的中心点，按 id 取。
   *
   * 烟测脚本因此不必写死坐标。写死坐标的代价在道具栏上已经付过一次：
   * 布局一动，脚本就悄悄点在空气上，而烟测仍然"通过"。
   */
  devHotspot(id: string): { x: number; y: number } | null {
    const h = this.def?.hotspots.find((it) => it.id === id);
    if (!h) return null;
    const [x, y, w, hh] = h.rect;
    return { x: Math.round(x + w / 2), y: Math.round(y + hh / 2) };
  }

  /** 仅供开发钩子：当前所在的场景 id。 */
  devScene(): string {
    return this.def?.id ?? '';
  }

  /** 仅供开发钩子：密码盘开着的时候，返回按键文字 → 屏幕坐标。 */
  devPadKeys(): Record<string, { x: number; y: number }> | null {
    return this.pad?.isActive ? this.pad.devKeys() : null;
  }

  /** 仅供开发钩子：教学浮层开着时给出「知道了」的中心点，没开就是 null。 */
  devTutorial(): { close: { x: number; y: number } } | null {
    return this.tutorial?.devPanel() ?? null;
  }

  /** 仅供开发钩子：左上角「?」按钮的中心点（X2）。 */
  devTutorialButton(): { x: number; y: number } {
    return this.tutorialBtn.devState();
  }

  /** 仅供开发钩子：教学浮层累计弹出过几次（X2）。 */
  devTutorialOpens(): number {
    return this.tutorial.devOpens();
  }

  /**
   * 仅供开发钩子：场景是否已经"安静"下来。
   *
   * 烟测脚本靠它决定还要不要继续点。此前脚本用固定次数的心跳点击推进对话，
   * 台词一改行数就对不上，之后的每一步都偏 —— 而且看起来仍然像"通过了"。
   */
  devIdle(): {
    busy: boolean;
    textBox: boolean;
    card: boolean;
    doc: boolean;
    evidence: boolean;
    backArmed: boolean;
    tutorial: boolean;
  } {
    return {
      busy: this.busy,
      textBox: this.textBox.isActive,
      card: this.card.isActive,
      doc: this.doc.isActive,
      evidence: this.evidence.isActive,
      backArmed: this.back.isArmed,
      tutorial: this.tutorial.isActive,
    };
  }

  /** 仅供开发钩子：道具栏左上角「证据」按钮的中心点（C1）。 */
  devEvidenceButton(): { x: number; y: number } {
    return this.bar.devEvidenceButton();
  }

  /** 仅供开发钩子：证据列表的行中心点（键是道具名）与关闭按钮位置。没开就是 null。 */
  devEvidenceRows(): { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null {
    return this.evidence.devPanel();
  }

  /** 仅供开发钩子：右上角返回按钮的中心点，以及它是不是正等着第二下（C2）。 */
  devBack(): { x: number; y: number; armed: boolean } {
    return this.back.devState();
  }

  /**
   * 仅供开发钩子：累计弹出过多少个点击反馈环（C3）。
   *
   * 环本身只活 300ms，截图很难稳定抓到它。给一个计数器，
   * 断言才能问"这一下到底有没有被收到"，而不是靠一张可能扑空的图。
   */
  devRippleCount(): number {
    return this.rippleCount;
  }

  /**
   * 仅供开发钩子：直接弹一次章节卡。
   *
   * 章节卡只在 `advanceChapter` 里出现，而推进章节得先凑齐本章道具再走完
   * 一段对话 —— 想截全三张卡就得跑三条完整路线。给一个口子，三张卡各自的
   * 版面（每章一个色调、一个序号水印）一次就能截完。
   */
  devChapterCard(index: number): boolean {
    if (!CHAPTERS[index]) return false;
    void this.card.show(index);
    return true;
  }

  /**
   * 仅供开发钩子：当前场景里的一个"空地"坐标——不落在任何热点上，
   * 点它只会推进对话或放手中的道具，不会误触剧情。
   *
   * 写死一个中性点是不够的：第二章船长室的办公桌热点一路铺到 y=950，
   * 第一章好用的那个坐标在这里正好压在桌子上。
   */
  devNeutral(): { x: number; y: number } {
    const inHot = (x: number, y: number): boolean =>
      (this.def?.hotspots ?? []).some((h) => {
        const [hx, hy, hw, hh] = h.rect;
        return x >= hx - 6 && x <= hx + hw + 6 && y >= hy - 6 && y <= hy + hh + 6;
      });

    const xs: number[] = [GAME_WIDTH / 2];
    for (let d = 30; d < GAME_WIDTH / 2; d += 30) {
      xs.push(GAME_WIDTH / 2 - d, GAME_WIDTH / 2 + d);
    }
    for (let y = STAGE_HEIGHT - 40; y > 24; y -= 30) {
      for (const x of xs) {
        if (x < 12 || x > GAME_WIDTH - 12) continue;
        if (!inHot(x, y)) return { x: Math.round(x), y: Math.round(y) };
      }
    }
    return { x: Math.round(GAME_WIDTH / 2), y: 24 };
  }

  // ── 效果解释器 ───────────────────────────────────────

  private async run(effects: readonly Effect[], hotspotId?: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.runEffects(effects, hotspotId);
    } finally {
      this.busy = false;
      // 存档点之二：一次交互跑完就落盘。
      //
      // 只靠 create 那一次的话，"在一个场景里捡了东西、然后直接关掉页面"
      // 会白捡 —— 那件道具根本没进过存档。
      //
      // 效果里带 goto 时这里存的是**旧** sceneId，但新场景的 create 紧接着
      // （下一帧）就会用新 sceneId 覆盖掉，所以最终落盘的是新场景。
      saveProgress(this.def.id, gameState.snapshot());
    }
  }

  /**
   * 按顺序执行一串效果。
   * @returns true = 场景已经切走，后面的效果不要再执行
   */
  private async runEffects(effects: readonly Effect[], hotspotId?: string): Promise<boolean> {
    for (const e of effects) {
      const stop = await this.apply(e, hotspotId);
      if (stop) return true;
    }
    return false;
  }

  /** @returns true = 场景已经切走，后面的效果不要再执行 */
  private async apply(e: Effect, hotspotId?: string): Promise<boolean> {
    switch (e.t) {
      case 'say':
        await this.textBox.show(e.who, e.lines);
        return false;

      case 'give': {
        if (gameState.addItem(e.item)) {
          this.refreshBar();
          // 东西进了包，场景里那件就得消失（X3）。画家靠 ctx.has() 判断，
          // 但底图是画一次的静态图 —— 不重画，画面上那根撬棍还在水里。
          this.paintScene();
          this.toast.show(`获得「${ITEMS[e.item].name}」`);
          // 只给「线索」和「关键道具」配提示音；工具与附属物证只是一次普通交互，
          // 上面那句 hotspot 已经响过了，再叠一层反而分不清轻重。
          const kind = ITEMS[e.item].kind;
          if (kind === 'key') playSfx(this, 'keyItem');
          else if (kind === 'clue') playSfx(this, 'clue');
        }
        return false;
      }

      case 'flag':
        gameState.setFlag(e.flag);
        return false;

      case 'openDoc':
        playSfx(this, 'document');
        await this.doc.show(DOCS[e.doc]);
        return false;

      case 'toast':
        this.toast.show(e.text, { emphasis: e.emphasis });
        return false;

      case 'flashback':
        playSfx(this, 'flashback');
        await this.flashback(e.lines);
        return false;

      case 'chapterCard':
        await this.card.show(e.chapter);
        return false;

      case 'goto':
        await this.fadeOut();
        this.scene.start('Explore', { sceneId: e.scene });
        return true;

      case 'advanceChapter': {
        // 收集不全 → 只提示一次，不推进；再点一次才走（设计文档 9.3）
        if (this.holdBack(e.from, hotspotId, e.hint ?? '要不要再找找？')) return false;

        await this.textBox.show(e.who, e.lines);
        await this.card.show(e.to);

        const next = CHAPTER_FIRST_SCENE[e.to];
        if (next && SCENES[next]) {
          await this.fadeOut();
          this.scene.start('Explore', { sceneId: next });
        } else {
          this.toast.show(`第 ${e.to + 1} 章尚未接入（P${e.to + 1} 开发中）`);
        }
        return true;
      }

      case 'searchAgain': {
        if (this.holdBack(e.chapter, hotspotId, e.hint ?? '要不要再找找？')) return false;
        return await this.runEffects(e.then, hotspotId);
      }

      case 'password': {
        const unlocked = await this.pad.show({
          title: e.title,
          answer: e.answer,
          wrongText: e.wrongText,
        });
        // 玩家直接关掉面板 = 什么都没发生，保险柜还锁着
        if (!unlocked) return false;
        return await this.runEffects(e.success, hotspotId);
      }

      case 'ending':
        await this.fadeOut();
        this.scene.start('Ending');
        return true;

      case 'confrontation':
        await this.fadeOut();
        this.scene.start('Confrontation');
        return true;

      default: {
        const never: never = e;
        throw new Error(`未处理的 Effect: ${JSON.stringify(never)}`);
      }
    }
  }

  // ── 闪回 ─────────────────────────────────────────────

  /**
   * 闪回：黑白插入，不可跳过（点击可提前结束）。
   * 画面是占位示意 —— P5 换成正式美术的一张定格图。
   */
  private flashback(lines: readonly string[]): Promise<void> {
    return new Promise<void>((resolve) => {
      const layer = this.add.container(0, 0).setDepth(700);

      const bg = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 1).setOrigin(0, 0);
      layer.add(bg);

      const g = this.add.graphics();
      // 一只握着铜徽的手（去色，只有灰阶）
      g.fillStyle(0x2a2e31, 1);
      g.fillEllipse(GAME_WIDTH / 2, 620, 300, 360);
      g.fillStyle(0x1d2023, 1);
      g.fillEllipse(GAME_WIDTH / 2 - 120, 500, 150, 210);
      g.fillStyle(0x9aa0a4, 1);
      g.fillCircle(GAME_WIDTH / 2 + 20, 600, 96);
      g.lineStyle(6, 0x54595d, 1);
      g.strokeCircle(GAME_WIDTH / 2 + 20, 600, 96);
      // 徽面上的蛇形盘绕
      g.lineStyle(5, 0x6a7075, 1);
      g.beginPath();
      g.moveTo(GAME_WIDTH / 2 - 26, 636);
      g.lineTo(GAME_WIDTH / 2 - 4, 596);
      g.lineTo(GAME_WIDTH / 2 + 18, 632);
      g.lineTo(GAME_WIDTH / 2 + 44, 590);
      g.strokePath();
      // 手背上的一道旧疤
      g.lineStyle(4, 0x6d5f56, 1);
      g.lineBetween(GAME_WIDTH / 2 - 132, 452, GAME_WIDTH / 2 - 96, 512);
      layer.add(g);

      const caption = this.add
        .text(GAME_WIDTH / 2, 930, lines.join('\n'), {
          fontFamily: FONT_SANS,
          fontSize: '18px',
          color: '#6f7a82',
          align: 'center',
          lineSpacing: 12,
        })
        .setOrigin(0.5);
      layer.add(caption);

      layer.setAlpha(0);
      this.tweens.add({ targets: layer, alpha: 1, duration: 260 });

      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        this.tweens.add({
          targets: layer,
          alpha: 0,
          duration: 320,
          onComplete: () => {
            layer.destroy(true);
            resolve();
          },
        });
      };

      this.time.delayedCall(FLASHBACK_MS + 1400, finish);
      this.input.once('pointerdown', finish);
    });
  }

  // ── 调试：热点轮廓（H 键）─────────────────────────────

  private toggleDebug(): void {
    this.debug = !this.debug;
    this.debugLayer?.destroy(true);
    this.debugLayer = undefined;
    if (!this.debug) return;

    const layer = this.add.container(0, 0).setDepth(400);
    const g = this.add.graphics();
    g.lineStyle(2, 0x2fd4e0, 0.9);

    for (const h of this.def.hotspots) {
      const [x, y, w, hh] = h.rect;
      g.strokeRect(x, y, w, hh);
    }
    layer.add(g);

    for (const h of this.def.hotspots) {
      const [x, y] = h.rect;
      const label = this.add.text(x + 4, y + 4, h.label, {
        fontFamily: FONT_SANS,
        fontSize: '15px',
        color: '#2fd4e0',
        backgroundColor: '#000000cc',
      });
      layer.add(label);
    }

    const info = this.add.text(
      12,
      10,
      `${this.def.id}　·　${this.def.title}\n道具 ${gameState.items.size}　关键 ${gameState.keyCount}　线索 ${gameState.clueCount}`,
      { fontFamily: FONT_SANS, fontSize: '16px', color: '#2fd4e0', backgroundColor: '#000000cc', lineSpacing: 6 },
    );
    layer.add(info);

    this.debugLayer = layer;
  }
}
