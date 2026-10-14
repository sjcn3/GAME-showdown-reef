/**
 * 证据列表浮层（设计文档 9.2 的补充）
 *
 * 为什么需要它：11 件道具里有 4 件是文档 —— 涂改提货单、油轮航海日志、
 * 保护名单残页、半块警号牌背面。玩家读过一次，那张纸就再也调不出来了。
 * 而第三章对峙恰恰要求引用纸上的内容（「报关单上写的是什么」），
 * 道具栏却只给 6 个字的道具名，玩家只能凭记忆选牌，选错还要吃一个破绽。
 *
 * 所以把道具栏左上角那个「证据」标签做成按钮：点开是已获得的全部证据，
 * 带文档的那几件能重读原件（复用 DocumentOverlay 的纸面）。
 *
 * 不做分页、不做滚动：最多 11 件，一屏放得下。真放不下再说 ——
 * 现在写一套滚动，只会多一处永远不会被执行到的分支。
 */

import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { ITEMS, ITEM_KIND_LABEL, type ItemId } from '../data/items';
import { DOC_FOR_ITEM } from '../data/documents';
import type { DocId } from '../core/Story';
import type { GameState } from '../core/GameState';
import { drawItemIcon } from '../art/itemIcons';
import { KIND_COLOR } from './itemKind';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';

const PANEL_X = 40;
const PANEL_W = GAME_WIDTH - PANEL_X * 2; // 640
const PANEL_TOP = 88;
const PANEL_BOTTOM = 1096;
const HEADER_H = 86;
const FOOTER_H = 24;
const ROW_GAP = 8;
const MIN_ROW_H = 60;
const MAX_ROW_H = 82;

export class EvidenceLog {
  private readonly container: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly count: Phaser.GameObjects.Text;
  private readonly closeBtn: Phaser.GameObjects.Text;
  private readonly rowsLayer: Phaser.GameObjects.Container;

  private running = false;
  /** 每行的中心点，键是道具 id —— 只给开发钩子用（脚本按 id 点「重读原件」） */
  private readonly rowCenters = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onOpenDoc: (id: DocId) => void,
  ) {
    const dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.88).setOrigin(0, 0);

    // 全屏背板：点面板外任意处关掉列表。
    //
    // 为什么不靠场景转发点击坐标来判断 —— 打开列表的那一下点击本身就落在
    // 道具栏上（y≈1120），也就是"面板外"，于是同一下点击会立刻把它关掉。
    // 背板不走这条路：它随容器一起变可见，而这一下点击的命中列表在它变可见
    // 之前就已经算完了，所以它只会接住下一根手指。
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive();
    this.backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      // 面板里面留着不动：行自己处理行内的点击，空白处按了也不该把列表甩掉
      if (p.y < PANEL_TOP || p.y > PANEL_BOTTOM) this.close();
    });

    this.panel = scene.add.graphics();
    this.rowsLayer = scene.add.container(0, 0);

    this.title = scene.add
      .text(PANEL_X + 28, PANEL_TOP + 24, '证据', {
        fontFamily: FONT_SERIF,
        fontSize: '24px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0, 0);

    this.count = scene.add
      .text(PANEL_X + PANEL_W - 76, PANEL_TOP + 32, '', {
        fontFamily: FONT_SANS,
        fontSize: '15px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(1, 0);

    // 关闭：面板右上角。点面板外也关（见 pointerDown），两条路都留着 ——
    // 手机上拇指够得到右上角，但也不该因为差几像素没点中就被困在这里。
    this.closeBtn = scene.add
      .text(PANEL_X + PANEL_W - 30, PANEL_TOP + 22, '✕', {
        fontFamily: FONT_SANS,
        fontSize: '22px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5, 0)
      .setInteractive({ useHandCursor: true });
    this.closeBtn.on('pointerover', () => this.closeBtn.setColor(toCss(COLORS.ink)));
    this.closeBtn.on('pointerout', () => this.closeBtn.setColor(toCss(COLORS.inkDim)));
    this.closeBtn.on('pointerdown', () => this.close());

    this.container = scene.add
      .container(0, 0, [
        this.backdrop,
        dim,
        this.panel,
        this.title,
        this.count,
        this.rowsLayer,
        this.closeBtn,
      ])
      // 比文档浮层（800）低一层：从证据里点开原件时，纸面要盖在列表上
      .setDepth(780)
      .setVisible(false);
  }

  get isActive(): boolean {
    return this.running;
  }

  open(state: GameState): void {
    this.running = true;
    this.render(state);
    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 160 });
  }

  close(): void {
    if (!this.running) return;
    this.running = false;
    this.container.setVisible(false);
  }

  /**
   * 仅供开发钩子：行的中心点 + 关闭按钮中心。**列表没开时返回 null。**
   *
   * 早先分成 devRows()/devClose() 两个方法，前者返回 null、后者永远有值，
   * 场景那边一律 `?? {}` 拼成一个对象 —— 于是"没开"和"开了但一行都没有"
   * 长得一模一样，烟测里"点开了吗"和"关掉了吗"两个断言全部恒真。
   * 现在只留一个方法，没开就是 null，没有第二种解释。
   */
  devPanel(): { rows: Record<string, { x: number; y: number }>; close: { x: number; y: number } } | null {
    if (!this.running) return null;
    return {
      rows: Object.fromEntries(this.rowCenters),
      close: { x: Math.round(this.closeBtn.x), y: Math.round(this.closeBtn.y + 11) },
    };
  }

  // ── 绘制 ─────────────────────────────────────────────

  private render(state: GameState): void {
    const owned = state.owned();
    this.rowsLayer.removeAll(true);
    this.rowCenters.clear();

    this.count.setText(owned.length === 0 ? '' : `已获 ${owned.length} 件`);

    this.panel.clear();
    this.panel.fillStyle(0x0e1317, 0.98);
    this.panel.fillRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_BOTTOM - PANEL_TOP);
    this.panel.lineStyle(1, 0x33454f, 1);
    this.panel.strokeRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_BOTTOM - PANEL_TOP);
    this.panel.lineStyle(1, 0x33454f, 0.7);
    this.panel.lineBetween(PANEL_X + 24, PANEL_TOP + 70, PANEL_X + PANEL_W - 24, PANEL_TOP + 70);

    if (owned.length === 0) {
      const hint = this.scene.add
        .text(GAME_WIDTH / 2, (PANEL_TOP + PANEL_BOTTOM) / 2, '还什么都没有。', {
          fontFamily: FONT_SANS,
          fontSize: '16px',
          color: '#3d4b54',
        })
        .setOrigin(0.5);
      this.rowsLayer.add(hint);
      return;
    }

    const top = PANEL_TOP + HEADER_H;
    const avail = PANEL_BOTTOM - FOOTER_H - top;
    const rowH = Phaser.Math.Clamp(avail / owned.length, MIN_ROW_H, MAX_ROW_H);
    // 行数少时整块居中，免得两件证据挂在面板最上面、下面空一大片
    const startY = top + Math.max(0, (avail - rowH * owned.length) / 2);

    owned.forEach((id, i) => {
      const cy = Math.round(startY + i * rowH + rowH / 2);
      this.drawRow(id, cy, Math.round(rowH) - ROW_GAP);
    });
  }

  private drawRow(id: ItemId, cy: number, h: number): void {
    const def = ITEMS[id];
    const docId = DOC_FOR_ITEM[id];
    const plateX = PANEL_X + 20;
    const plateW = PANEL_W - 40;
    const top = cy - h / 2;

    const g = this.scene.add.graphics();
    g.fillStyle(0x111820, 0.9);
    g.fillRoundedRect(plateX, top, plateW, h, 8);
    g.lineStyle(1, docId ? 0x4a5a3a : 0x28353d, 1);
    g.strokeRoundedRect(plateX, top, plateW, h, 8);
    this.rowsLayer.add(g);

    const icon = this.scene.add.graphics();
    drawItemIcon(icon, id, plateX + 42, cy, KIND_COLOR[def.kind], 1);
    this.rowsLayer.add(icon);

    const name = this.scene.add
      .text(plateX + 84, cy - 24, def.name, {
        fontFamily: FONT_SANS,
        fontSize: '16px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0, 0);
    this.rowsLayer.add(name);

    const kind = this.scene.add
      .text(plateX + 84 + name.width + 10, cy - 21, ITEM_KIND_LABEL[def.kind], {
        fontFamily: FONT_SANS,
        fontSize: '12px',
        color: toCss(KIND_COLOR[def.kind]),
      })
      .setOrigin(0, 0);
    this.rowsLayer.add(kind);

    const desc = this.scene.add
      .text(plateX + 84, cy + 2, def.desc, {
        fontFamily: FONT_SANS,
        fontSize: '14px',
        color: toCss(COLORS.inkDim),
        wordWrap: { width: docId ? 380 : 470 },
      })
      .setOrigin(0, 0);
    this.rowsLayer.add(desc);

    // 有原件的才给这一行加可点提示：其余几件只有一句话描述，
    // 点下去也变不出东西来，做成"看起来能点"反而是骗人。
    if (docId) {
      const more = this.scene.add
        .text(plateX + plateW - 18, cy, '重读原件 ›', {
          fontFamily: FONT_SANS,
          fontSize: '14px',
          color: toCss(COLORS.accent),
        })
        .setOrigin(1, 0.5);
      this.rowsLayer.add(more);

      const hit = this.scene.add
        .rectangle(plateX + plateW / 2, cy, plateW, h, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.close();
        this.onOpenDoc(docId);
      });
      this.rowsLayer.add(hit);
    }

    this.rowCenters.set(id, { x: Math.round(plateX + plateW / 2), y: cy });
  }
}
