/**
 * 底部道具栏（设计文档 9.1）
 *
 * 已获得的道具按**获得先后**排列，新道具追加在末尾。
 * 不按类别排序是有意的：那样每捡到一件东西整条栏都会平移，
 * 玩家手指底下的道具会突然换成另一件，一按就选错。
 * 点一下选中（手持），再点场景中的热点 = 对那个东西使用这件道具。
 */

import type Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH, INVENTORY_HEIGHT } from '../config';
import { ITEMS, type ItemId } from '../data/items';
import type { GameState } from '../core/GameState';
import { drawItemIcon } from '../art/itemIcons';
import { KIND_COLOR } from './itemKind';
import { FONT_SANS, toCss } from './theme';

const BAR_TOP = GAME_HEIGHT - INVENTORY_HEIGHT;
const HEADER_H = 32;
const COLS = 6;
const CELL_W = GAME_WIDTH / COLS; // 120
const CELL_H = 58;
const GRID_TOP = BAR_TOP + HEADER_H; // 1136

/**
 * 单行时格子高一点、双行时压扁。
 *
 * 原来固定 68 高、从 GRID_TOP 往下堆：一行时内容止于 1208、底部空 72px，
 * 两行时最后一行像素落在 1274 —— 离屏幕底只剩 6px，真机的手势条正好压在上面。
 * 同一个控件两种状态两套垂直位置，怎么调都会有一头不对，所以按行数给高度。
 */
const CELL_H_SINGLE = 68;
const CELL_H_MULTI = 58;

/** 「证据」按钮的命中区：标题行左侧那一段。32px 高是整个标题行的高度。 */
const EVIDENCE_HIT = { x: 0, y: BAR_TOP, w: 200, h: HEADER_H } as const;

function cellHeight(total: number): number {
  return Math.ceil(Math.max(1, total) / COLS) > 1 ? CELL_H_MULTI : CELL_H_SINGLE;
}

/** 第 index 个格子的中心点。排版与命中区共用，避免两处算法走偏。 */
function cellCenter(index: number, total: number): { x: number; y: number } {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const h = cellHeight(total);
  return { x: col * CELL_W + CELL_W / 2, y: GRID_TOP + row * h + h / 2 };
}

/*
 * 格子里的图形由 art/itemIcons.ts 按**道具 id** 画，不再按类别画。
 * 原来四种类别各一个通用形状，于是「撬棍」和「底舱钥匙」长得一模一样、
 * 五条线索也长得一模一样 —— 玩家在一个 112px 的格子里只有 6 个汉字可认。
 */

export class InventoryBar {
  private readonly container: Phaser.GameObjects.Container;
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly itemsLayer: Phaser.GameObjects.Container;
  private readonly headerLeft: Phaser.GameObjects.Text;
  private readonly headerRight: Phaser.GameObjects.Text;

  private state: GameState | null = null;
  private selected: ItemId | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onChange: (id: ItemId | null) => void,
    private readonly onEvidence: () => void,
  ) {
    const bg = scene.add.rectangle(0, BAR_TOP, GAME_WIDTH, INVENTORY_HEIGHT, 0x0a0f12, 0.96).setOrigin(0, 0);
    const topLine = scene.add.rectangle(0, BAR_TOP, GAME_WIDTH, 1, 0x33454f, 1).setOrigin(0, 0);

    this.frame = scene.add.graphics();
    this.itemsLayer = scene.add.container(0, 0);

    this.headerLeft = scene.add.text(16, BAR_TOP + 10, '', {
      fontFamily: FONT_SANS,
      fontSize: '15px',
      color: toCss(COLORS.inkDim),
    });

    this.headerRight = scene.add
      .text(GAME_WIDTH - 16, BAR_TOP + 10, '', {
        fontFamily: FONT_SANS,
        fontSize: '15px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(1, 0);

    // 「证据」标签同时是一个按钮：点开已获证据列表，带原件的能重读。
    // 为什么不另起一个按钮 —— 标题行左边这块本来就是空的，而道具栏
    // 已经没有多余高度了（底部安全区刚够 30px）。
    // 命中区只占标题行那 32px，且排在道具格之前，压在格子上的那几像素
    // 归格子 —— 明明按在道具上却弹出证据列表，比按钮小一点更糟。
    const evidenceHit = scene.add
      .rectangle(EVIDENCE_HIT.x, EVIDENCE_HIT.y, EVIDENCE_HIT.w, EVIDENCE_HIT.h, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    evidenceHit.on('pointerdown', () => {
      // 手持道具时这一行显示的是「手持：××」，此刻它不是按钮
      if (!this.selected) this.onEvidence();
    });
    evidenceHit.on('pointerover', () => {
      if (!this.selected) this.headerLeft.setColor(toCss(COLORS.ink));
    });
    evidenceHit.on('pointerout', () => {
      if (!this.selected) this.headerLeft.setColor(toCss(COLORS.accent));
    });

    this.container = scene.add
      .container(0, 0, [
        bg,
        topLine,
        this.frame,
        this.headerLeft,
        this.headerRight,
        evidenceHit,
        this.itemsLayer,
      ])
      .setDepth(600);
  }

  get held(): ItemId | null {
    return this.selected;
  }

  clearSelection(): void {
    if (this.selected === null) return;
    this.selected = null;
    this.render();
    this.onChange(null);
  }

  /**
   * 某件道具当前所在格子的中心点（未持有则 null）。
   * 供端到端脚本按名字点击道具，免得脚本里写死格子坐标、
   * 一旦某个道具提前/推后拿到就整条流程错位。
   */
  cellCenterOf(id: ItemId): { x: number; y: number } | null {
    if (!this.state) return null;
    const owned = this.state.owned();
    const index = owned.indexOf(id);
    return index < 0 ? null : cellCenter(index, owned.length);
  }

  /**
   * 「证据」按钮的中心点。供端到端脚本点开证据列表用 ——
   * 标题行左侧那块也是 200×32 的命中区，脚本写死 (100, 1120) 一样能用，
   * 但那正是我们花了一轮才清掉的坏习惯。
   */
  devEvidenceButton(): { x: number; y: number } {
    return {
      x: Math.round(EVIDENCE_HIT.x + EVIDENCE_HIT.w / 2),
      y: Math.round(EVIDENCE_HIT.y + EVIDENCE_HIT.h / 2),
    };
  }

  refresh(state: GameState): void {
    this.state = state;
    if (this.selected && !state.has(this.selected)) this.selected = null;
    this.render();
  }

  private render(): void {
    const state = this.state;
    if (!state) return;

    const owned = state.owned();

    this.headerLeft
      .setText(this.selected ? `手持：${ITEMS[this.selected].name}` : '证据 ›')
      .setColor(toCss(this.selected ? COLORS.ink : COLORS.accent));
    this.headerRight.setText(
      this.selected
        ? '再点场景使用　·　点这里取消'
        : `关键道具 ${state.keyCount}/2　·　线索 ${state.clueCount}/5`,
    );

    this.frame.clear();
    this.itemsLayer.removeAll(true);

    if (owned.length === 0) {
      const hint = this.scene.add
        .text(GAME_WIDTH / 2, GRID_TOP + CELL_H_SINGLE, '还什么都没有。', {
          fontFamily: FONT_SANS,
          fontSize: '15px',
          color: '#3d4b54',
        })
        .setOrigin(0.5);
      this.itemsLayer.add(hint);
      return;
    }

    const h = cellHeight(owned.length);
    const plateW = CELL_W - 8; // 112
    const plateH = h - 6;
    const iconCy = plateH * 0.22; // 相对格子中心的偏移
    const nameDy = plateH * 0.24;

    owned.forEach((id, i) => {
      const { x: cx, y: cy } = cellCenter(i, owned.length);
      const isSel = this.selected === id;
      const def = ITEMS[id];

      // 底板（选中态高亮）
      this.frame.fillStyle(isSel ? 0x233039 : 0x111820, isSel ? 1 : 0.85);
      this.frame.fillRoundedRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH, 6);
      this.frame.lineStyle(1, isSel ? COLORS.accent : 0x28353d, 1);
      this.frame.strokeRoundedRect(cx - plateW / 2, cy - plateH / 2, plateW, plateH, 6);

      const icon = this.scene.add.graphics();
      drawItemIcon(icon, id, cx, cy - iconCy, KIND_COLOR[def.kind]);
      this.itemsLayer.add(icon);

      const name = this.scene.add
        .text(cx, cy + nameDy, def.name, {
          fontFamily: FONT_SANS,
          fontSize: '11px',
          color: toCss(isSel ? COLORS.ink : COLORS.inkDim),
        })
        .setOrigin(0.5, 0);
      // 中文按 11px 字号实测每字约 13.5px 进格，「夹层切割痕迹」这类 6 字名
      // 在 86px 的老格子里左右只剩 1~3px。列宽加到 120 之后仍留一道保险：
      // 真放不下就缩到 10px，而不是让它溢出格子。
      if (name.width > plateW - 8) name.setFontSize(10);
      this.itemsLayer.add(name);

      const hit = this.scene.add
        .rectangle(cx, cy, plateW, plateH, 0x000000, 0)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selected = this.selected === id ? null : id;
        this.render();
        this.onChange(this.selected);
      });
      hit.on('pointerover', () => {
        if (this.selected !== id) name.setColor(toCss(COLORS.ink));
      });
      hit.on('pointerout', () => {
        if (this.selected !== id) name.setColor(toCss(COLORS.inkDim));
      });
      this.itemsLayer.add(hit);
    });
  }
}
