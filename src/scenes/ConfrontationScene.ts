/**
 * 第三章 · 对峙（设计文档 6.3 / 6.4）
 *
 * 三个回合，每回合从道具栏选一件东西、点向那个该应付的人。
 *   收集决定「你有什么牌」，顺序决定「你打得好不好」。
 *
 * 这一场不是「探索场景 + 热点分支」能表达的：热点分支是纯函数、
 * 只看得见 GameState，而这里每回合的结果要反过来驱动台词，还要允许重试。
 * 所以单独做成一个场景，判定仍然全部委托给 core/EndingResolver.ts。
 */

import Phaser from 'phaser';

import { addSceneFigures, PLACEHOLDER_PAINT } from '../art/placeholders';
import { addSceneAmbient } from '../art/sceneAmbient';
import { COLORS, GAME_WIDTH, STAGE_HEIGHT } from '../config';
import {
  CLOSING_LINES,
  CONFRONTATION_TARGETS,
  DISABLED_LINE,
  EMPTY_HANDS_LINE,
  FUMBLE_CAP_LINES,
  NEED_ITEM_HINT,
  ROUND_SCRIPTS,
  WRONG_TARGET_HINT,
} from '../data/confrontation';
import type { ItemId } from '../data/items';
import { DOCS } from '../data/documents';
import { MAX_FUMBLES, isSelectableInConfrontation } from '../core/EndingResolver';
import { playSfx } from '../core/Sfx';
import { hits, type DocId } from '../core/Story';
import { gameState } from '../store';
import { BackButton } from '../ui/BackButton';
import { DocumentOverlay } from '../ui/DocumentOverlay';
import { EvidenceLog } from '../ui/EvidenceLog';
import { InventoryBar } from '../ui/InventoryBar';
import { TextBox } from '../ui/TextBox';
import { Toast } from '../ui/Toast';
import { FONT_SANS } from '../ui/theme';

/** 同一回合反复打偏时的追加反馈（不叠加破绽，只把话再说一遍） */
const AGAIN_LINE = '……还是不对。';

/**
 * 一块安全的空地：不落在任何目标上、也不在道具栏里。
 * 点它只会推进对话（烟测脚本与 settle 步骤用它）。
 */
const CONFRONT_NEUTRAL = { x: 360, y: 1000 } as const;

/** 场景切换的淡入淡出时长（C4），与 ExploreScene 保持一致 */
const FADE_MS = 200;

export class ConfrontationScene extends Phaser.Scene {
  private textBox!: TextBox;
  private toast!: Toast;
  private bar!: InventoryBar;
  private evidence!: EvidenceLog;
  private back!: BackButton;
  private doc!: DocumentOverlay;
  private roundLabel!: Phaser.GameObjects.Text;
  private highlight!: Phaser.GameObjects.Graphics;

  /** 轮到玩家出牌时挂上；点中目标就兑现 */
  private waiting?: (item: ItemId) => void;

  private busy = false;
  /** 累计弹出过多少个点击反馈环（C3）—— 只给开发钩子断言用 */
  private rippleCount = 0;

  constructor() {
    super('Confrontation');
  }

  init(): void {
    this.waiting = undefined;
    this.busy = false;
    this.rippleCount = 0;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    const art = this.add.graphics();
    const painter = PLACEHOLDER_PAINT['warehouse_night'];
    // 对峙用的这张图不吃 ctx（仓库夜里没有可捡的东西），但接口要求传一个。
    // 传真实状态而不是空壳：万一以后这张图也想跟着状态变，这里不用再改。
    if (painter) painter(art, GAME_WIDTH, STAGE_HEIGHT, { has: (id) => gameState.has(id) });

    // 第 2 组 B1/B2：会下的雨、会晃的湿地反光、会飘的尘埃
    addSceneAmbient(this, 'warehouse_night');
    // 第 2 组 B5：两个人物各自独立成层，呼吸周期不同（同步呼吸像在一起点头）
    addSceneFigures(this, 'warehouse_night');

    // 这一层画在场景之上、对话框（深度 500）之下
    this.highlight = this.add.graphics().setDepth(400);
    this.tweens.add({
      targets: this.highlight,
      alpha: { from: 0.5, to: 1 },
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // 顶部标签原本在 y=54、18px、#6b7c88 —— 全屏最暗的正文，却要承担
    // "这一回合该应付谁"这样唯一的指路信息，而且贴在刘海区里。
    // 提亮、加大、下移。
    // y=86 时实测墨迹落在 y75–95，顶端仍有 5px 探进刘海区；
    // 这一版压到 y=96（墨迹约 y85–105），整行都在安全线以下。
    this.roundLabel = this.add
      .text(GAME_WIDTH / 2, 96, '', {
        fontFamily: FONT_SANS,
        fontSize: '21px',
        color: '#9aa7b2',
      })
      .setOrigin(0.5)
      .setDepth(420);

    this.textBox = new TextBox(this);
    this.doc = new DocumentOverlay(this);
    this.evidence = new EvidenceLog(this, (id) => void this.reread(id));
    this.bar = new InventoryBar(
      this,
      () => this.bar.refresh(gameState),
      () => this.evidence.open(gameState),
    );
    this.toast = new Toast(this);
    this.back = new BackButton(
      this,
      () => this.covered(),
      () => this.scene.start('Title'),
    );

    this.bar.refresh(gameState);
    this.wireInput();
    this.updateRoundLabel();
    this.cameras.main.fadeIn(FADE_MS, 0, 0, 0);

    void this.runConfrontation();
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
    this.input.keyboard?.on('keydown-ESC', () => {
      // ESC 先关浮层，再退标题
      if (this.evidence.isActive) {
        this.evidence.close();
        return;
      }
      if (!this.busy && !this.waiting) this.scene.start('Title');
    });
  }

  private onDown(p: Phaser.Input.Pointer): void {
    if (this.textBox.isActive) {
      this.textBox.tap();
      return;
    }
    if (this.evidence.isActive) {
      // 只栏点击。关闭由浮层自己的全屏背板处理（见 ExploreScene 同一处的注释）。
      return;
    }
    if (this.doc.isActive) {
      this.doc.pointerDown(p.y);
      return;
    }
    // 右上角返回按钮（C2）：自己处理"点两下"。Phaser 的对象输入不看深度，
    // 这里必须替它挡掉 —— 否则会同时"关掉证据列表"和"arm 一次返回"。
    if (this.back.hitTest(p.x, p.y)) return;
    // 只认 `waiting`，不认 `busy`。
    // `busy` 从 runConfrontation() 一开始就是 true，一直到整场结束才复位 ——
    // 拿它当闸门，玩家在"轮到你出牌"的整个窗口里怎么点都会被吞掉，
    // 而且一声不吭（这正是第一章那个 TextBox 卡死 bug 的同款形状）。
    if (!this.waiting) return;
    // 底部道具栏自己处理点击
    if (p.y >= STAGE_HEIGHT) return;

    const round = gameState.round;
    const target = round ? CONFRONTATION_TARGETS[round.id] : undefined;
    if (!round || !target) return;

    if (!hits(target.rect, p.x, p.y)) {
      // 点了另外两个人 —— 提醒一句，别让玩家以为「点了没反应」
      if (this.targetAt(p.x, p.y)) this.toast.show(WRONG_TARGET_HINT);
      return;
    }

    const held = this.bar.held;
    if (!held) {
      this.toast.show(NEED_ITEM_HINT);
      return;
    }

    const done = this.waiting;
    this.waiting = undefined;
    this.updateRoundLabel();
    this.ripple(p.x, p.y);
    done(held);
  }

  /**
   * 递出证据时的一圈反馈（C3）。与 ExploreScene 同款：
   * 这一步不可撤销（选错就是吃一个破绽），得让玩家确知"这一下递出去了"。
   */
  private ripple(x: number, y: number): void {
    this.rippleCount += 1;
    const ring = this.add.circle(x, y, 18).setStrokeStyle(2, COLORS.accent, 0.9).setDepth(410);
    ring.setScale(0.4);
    this.tweens.add({
      targets: ring,
      scale: 2.4,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  /** 换场景前的淡出（C4）。 */
  private fadeOut(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => resolve());
      this.cameras.main.fadeOut(FADE_MS, 0, 0, 0);
    });
  }

  /** 重读一份原件（C1）。与 ExploreScene 同一条路。 */
  private async reread(id: DocId): Promise<void> {
    this.evidence.close();
    await new Promise<void>((resolve) => {
      this.time.delayedCall(90, () => resolve());
    });
    playSfx(this, 'document');
    await this.doc.show(DOCS[id]);
  }

  /** 有浮层盖着右上角返回按钮（C2）。 */
  private covered(): boolean {
    return this.busy || this.evidence.isActive || this.doc.isActive || this.textBox.isActive;
  }

  /** 点到的位置是不是另外两个目标之一（用来区分「点错人」与「点空地」） */
  private targetAt(x: number, y: number): boolean {
    return Object.values(CONFRONTATION_TARGETS).some((t) => hits(t.rect, x, y));
  }

  private updateRoundLabel(): void {
    const round = this.waiting ? gameState.round : undefined;
    this.roundLabel.setText(round ? `对象 · ${round.target}` : '');
    this.drawHighlight();
  }

  /**
   * 把「这一回合该应付谁」直接画在场景里。
   *
   * 只靠顶部一行小字是不够的：场上三个人是同一色系里的两块暗剪影，
   * 玩家读到"对象 · 陈老板"之后仍然不知道该往哪儿递东西 ——
   * 审计报告的原话是"两个 1.16:1 的灰色圆顶柱体，场景像素零变化"。
   * 这里只给**当前**目标打光、不给另外两个，所以它不算额外提示，
   * 只是把已经写在顶部的那句话挪到它该在的位置上。
   */
  private drawHighlight(): void {
    const g = this.highlight;
    g.clear();

    const round = this.waiting ? gameState.round : undefined;
    const target = round ? CONFRONTATION_TARGETS[round.id] : undefined;
    if (!target) return;

    const [x, y, w, h] = target.rect;
    const cx = x + w / 2;

    // 脚下的一滩暖光：不改动场景本身，只把视线收过去
    g.fillStyle(0xc9a227, 0.1);
    g.fillEllipse(cx, y + h - 4, w * 1.3, 42);
    g.fillStyle(0xc9a227, 0.07);
    g.fillEllipse(cx, y + h - 4, w * 1.8, 64);

    // 轮廓：低调，但边界明确
    g.lineStyle(2, 0xc9a227, 0.5);
    g.strokeRoundedRect(x - 6, y - 6, w + 12, h + 12, 12);

    // 头顶指示三角
    g.fillStyle(0xc9a227, 0.85);
    g.fillTriangle(cx - 12, y - 34, cx + 12, y - 34, cx, y - 16);
  }

  // ── 开发钩子（只在 ?dev=1 时被 dev.ts 取用）───────────

  /**
   * 和 ExploreScene 同名的查询口，好让烟测脚本的 `hold-item` / `click-item`
   * 在对峙里也能用。没有它，脚本会以为「手里什么都没有」而每次都去点一下，
   * 而点同一格是切换语义 —— 第二次点正好把手里的东西放下。
   */
  devInventory(): {
    held: ItemId | null;
    cellCenterOf: (id: ItemId) => { x: number; y: number } | null;
  } {
    return {
      held: this.bar.held,
      cellCenterOf: (id: ItemId) => this.bar.cellCenterOf(id),
    };
  }

  /**
   * 仅供开发钩子：按当前 state 重画道具栏。
   * 同 ExploreScene —— `__anJiao.give()` 绕过了热点，不补这一下，
   * 界面上就没有新格子，脚本按名字去点会点在空气上。
   */
  devRefresh(): void {
    this.bar.refresh(gameState);
  }

  /**
   * 自动化烟测用：三个目标的中心 + 现在轮不轮到玩家出牌。
   * 脚本一律用这里的坐标，绝不写死 —— 三个命中区一改，写死的脚本
   * 会点在空气上，而报告仍然显示"通过"。
   */
  devConfront(): {
    round: string;
    waiting: boolean;
    textBox: boolean;
    evidence: boolean;
    doc: boolean;
    fumbleCount: number;
    targets: Record<string, { x: number; y: number }>;
    neutral: { x: number; y: number };
  } | null {
    if (this.textBox.isActive) {
      // 对话还在播：先让脚本知道，并给一个安全的推进点
      return {
        round: gameState.round?.id ?? '',
        waiting: this.waiting !== undefined,
        textBox: true,
        evidence: this.evidence.isActive,
        doc: this.doc.isActive,
        fumbleCount: gameState.fumbleCount,
        targets: this.targetCenters(),
        neutral: CONFRONT_NEUTRAL,
      };
    }
    return {
      round: gameState.round?.id ?? '',
      waiting: this.waiting !== undefined,
      textBox: false,
      evidence: this.evidence.isActive,
      doc: this.doc.isActive,
      fumbleCount: gameState.fumbleCount,
      targets: this.targetCenters(),
      neutral: CONFRONT_NEUTRAL,
    };
  }

  /** 仅供开发钩子：道具栏左上角「证据」按钮的中心点（C1）。 */
  devEvidenceButton(): { x: number; y: number } {
    return this.bar.devEvidenceButton();
  }

  /** 仅供开发钩子：证据列表的行中心点与关闭按钮位置（C1）。没开就是 null。 */
  devEvidenceRows(): { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null {
    return this.evidence.devPanel();
  }

  /** 仅供开发钩子：右上角返回按钮的中心点与待确认状态（C2）。 */
  devBack(): { x: number; y: number; armed: boolean } {
    return this.back.devState();
  }

  /** 仅供开发钩子：累计弹出过多少个点击反馈环（C3）。 */
  devRippleCount(): number {
    return this.rippleCount;
  }

  private targetCenters(): Record<string, { x: number; y: number }> {
    const out: Record<string, { x: number; y: number }> = {};
    for (const [id, t] of Object.entries(CONFRONTATION_TARGETS)) {
      const [x, y, w, h] = t.rect;
      out[id] = { x: Math.round(x + w / 2), y: Math.round(y + h / 2) };
    }
    return out;
  }

  // ── 流程 ─────────────────────────────────────────────

  /** 手里还有没有能出示的东西（撬棍和底舱钥匙在对峙里用不了） */
  private hasPlayable(): boolean {
    return gameState.owned().some(isSelectableInConfrontation);
  }

  /** 等玩家把一件东西递上来 */
  private waitForPlay(): Promise<ItemId> {
    return new Promise<ItemId>((resolve) => {
      this.waiting = resolve;
      this.updateRoundLabel();
    });
  }

  private async runConfrontation(): Promise<void> {
    this.busy = true;
    try {
      /** 本回合的开场白是不是已经播过（打偏重试时不再重复） */
      let promptShown = false;

      while (!gameState.isConfrontationOver) {
        const round = gameState.round!;
        const script = ROUND_SCRIPTS[round.id]!;

        if (!promptShown) {
          await this.textBox.show(undefined, script.prompt);
          promptShown = true;
        }

        // 一件能出示的东西都没有 —— 只能沉默。
        // 没有这条口子，什么都没捡的玩家会在第一回合卡死（无可选项、点不动）。
        if (!this.hasPlayable()) {
          await this.textBox.show(undefined, [EMPTY_HANDS_LINE, ...script.passed]);
          gameState.abstain();
          promptShown = false;
          continue;
        }

        this.toast.show(NEED_ITEM_HINT);
        playSfx(this, 'confront');
        const item = await this.waitForPlay();
        const result = gameState.present(item);

        this.bar.clearSelection();
        this.bar.refresh(gameState);

        switch (result) {
          case 'correct':
            await this.textBox.show(undefined, script.correct);
            promptShown = false;
            break;

          case 'fumble':
            await this.textBox.show(undefined, script.fumble);
            // 回合没有推进 —— 让他换一件再来，开场白不重复
            break;

          case 'passed':
            // 手里根本没有能打中的牌：不计破绽，剧情自然推进
            await this.textBox.show(undefined, script.passed);
            promptShown = false;
            break;

          case 'fumble_capped':
            // 这一回合已经记过破绽了，反复出错不叠加
            this.toast.show(AGAIN_LINE, { emphasis: true });
            break;

          case 'disabled':
            this.toast.show(DISABLED_LINE);
            break;
        }
      }

      if (gameState.fumbleCount >= MAX_FUMBLES) {
        await this.textBox.show(undefined, FUMBLE_CAP_LINES);
      } else {
        await this.textBox.show(undefined, CLOSING_LINES);
      }

      await this.fadeOut();
      this.scene.start('Ending', { resolved: gameState.resolve() });
    } finally {
      this.busy = false;
    }
  }
}
