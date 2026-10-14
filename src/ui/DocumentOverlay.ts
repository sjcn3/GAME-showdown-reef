/**
 * 文档阅读浮层（设计文档 9.2，N15 确认效果）
 *
 * 参考 RDR2 读信界面：深色纸面 + 上下细横线 + 居中标题 + 衬线正文。
 * 全部自绘，不使用任何游戏原图。
 * 单页滚动，不做左右翻页；同一组件复用于 5 张文档内页。
 */

import Phaser from 'phaser';

import { COLORS, DOC_WIDTH_RATIO, GAME_HEIGHT, GAME_WIDTH } from '../config';
import type { DocDef } from '../data/documents';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';
import { cjkWrap } from './cjkWrap';

const PANEL_W = Math.round(GAME_WIDTH * DOC_WIDTH_RATIO); // 634
const PANEL_X = Math.round((GAME_WIDTH - PANEL_W) / 2); // 43
const TITLE_AREA = 104;
const FOOTER_AREA = 76;
const MAX_PANEL_H = 1000;
const LINE_GAP = 12;

const STYLE: Readonly<Record<string, { size: number; color: number; font: string }>> = {
  print: { size: 17, color: 0xd2dae0, font: FONT_SERIF },
  hand: { size: 19, color: 0xd8c48a, font: FONT_SERIF },
  note: { size: 15, color: 0x7c8b95, font: FONT_SERIF },
};

export class DocumentOverlay {
  private readonly container: Phaser.GameObjects.Container;
  private readonly dim: Phaser.GameObjects.Rectangle;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly bodyLayer: Phaser.GameObjects.Container;

  private maskShape?: Phaser.GameObjects.Graphics;
  private viewHeight = 0;
  private contentHeight = 0;
  private scrollY = 0;
  private dragFrom: number | null = null;
  private running = false;
  /**
   * 这一次「打开」之后有没有收到过 pointerdown。
   *
   * 打开浮层的那一次点击，**抬手（pointerup）会落在浮层自己身上**：
   * 手指/鼠标在证据行上按下 → 浮层弹出来 → 60ms 后同一根手指抬起，
   * 场景把 pointerup 转发进来，`dragFrom` 还是 null、`moved` 为 false，
   * 于是刚打开的原件被自己那一次点击的抬手当场关掉。
   *
   * 这是个竞态：是不是踩中取决于"浮层建好了没有"和"抬手到了没有"谁先。
   * 桌面 720×1280 下一直是浮层先建好（抬手时 running 已 true）→ 全绿；
   * 换成手机视口 + 触摸就翻过来了 —— 同一份代码，一条路线绿、一条红。
   * 手机上玩家点「重读原件」看到的就是"闪一下就没了"。
   *
   * 所以抬手只有在"见过按下"之后才算一次真正的点击。
   */
  private armed = false;
  private resolve: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    this.dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.84).setOrigin(0, 0);
    this.panel = scene.add.graphics();
    this.bodyLayer = scene.add.container(0, 0);

    this.title = scene.add
      .text(GAME_WIDTH / 2, 0, '', {
        fontFamily: FONT_SERIF,
        fontSize: '23px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5, 0);

    this.hint = scene.add
      .text(GAME_WIDTH / 2, 0, '点击任意处继续', {
        fontFamily: FONT_SANS,
        fontSize: '14px',
        color: '#5b6b75',
      })
      .setOrigin(0.5, 0);

    this.container = scene.add
      .container(0, 0, [this.dim, this.panel, this.title, this.bodyLayer, this.hint])
      .setDepth(800)
      .setVisible(false);
  }

  get isActive(): boolean {
    return this.running;
  }

  show(doc: DocDef): Promise<void> {
    this.running = true;
    this.armed = false;
    this.bodyLayer.removeAll(true);
    this.bodyLayer.setY(0);
    this.scrollY = 0;
    this.title.setText(doc.title);

    // 1) 先按顺序排好每一行并量高
    const bodyX = PANEL_X + 30;
    const bodyW = PANEL_W - 60;
    let y = 0;
    const rows: { obj: Phaser.GameObjects.Text; h: number; style: string }[] = [];

    for (const l of doc.lines) {
      const st = STYLE[l.style ?? 'print']!;
      const obj = this.scene.add
        .text(bodyX, 0, l.text.length > 0 ? l.text : ' ', {
          fontFamily: st.font,
          fontSize: `${st.size}px`,
          color: toCss(st.color),
          lineSpacing: 8,
          wordWrap: { width: bodyW, callback: cjkWrap },
        })
        .setOrigin(0, 0);
      const h = obj.height;
      rows.push({ obj, h, style: l.style ?? 'print' });
      this.bodyLayer.add(obj);
      y += h + LINE_GAP;
    }
    this.contentHeight = Math.max(0, y - LINE_GAP);

    // 2) 定面板尺寸与位置
    const wantH = TITLE_AREA + this.contentHeight + FOOTER_AREA;
    const panelH = Math.min(wantH, MAX_PANEL_H);
    const panelY = Math.round((GAME_HEIGHT - panelH) / 2);
    const bodyTop = panelY + TITLE_AREA;
    this.viewHeight = panelH - TITLE_AREA - FOOTER_AREA;

    // 3) 落到最终位置
    let cy = 0;
    for (const r of rows) {
      r.obj.setY(cy);
      if (r.style === 'note') r.obj.setX(bodyX + 14);
      cy += r.h + LINE_GAP;
    }
    this.bodyLayer.setY(bodyTop);

    // 4) 面板与细横线
    this.panel.clear();
    this.panel.fillStyle(0x101418, 1);
    this.panel.fillRect(PANEL_X, panelY, PANEL_W, panelH);
    this.panel.lineStyle(1, 0x33454f, 1);
    this.panel.strokeRect(PANEL_X, panelY, PANEL_W, panelH);
    this.panel.lineStyle(1, 0x4a5a66, 0.9);
    this.panel.lineBetween(PANEL_X + 28, panelY + 74, PANEL_X + PANEL_W - 28, panelY + 74);
    this.panel.lineBetween(
      PANEL_X + 28,
      panelY + panelH - 46,
      PANEL_X + PANEL_W - 28,
      panelY + panelH - 46,
    );

    this.title.setY(panelY + 32);
    this.hint.setY(panelY + panelH - 32);

    // 5) 内容超高才开滚动
    if (this.contentHeight > this.viewHeight) {
      this.maskShape?.destroy();
      this.maskShape = this.scene.make.graphics({});
      this.maskShape.fillStyle(0xffffff);
      this.maskShape.fillRect(bodyX - 6, bodyTop, bodyW + 12, this.viewHeight);
      this.bodyLayer.setMask(this.maskShape.createGeometryMask());
      this.hint.setText('上下拖动查看　·　点击空白处继续');
    } else {
      this.maskShape?.destroy();
      this.maskShape = undefined;
      this.bodyLayer.clearMask();
      this.hint.setText('点击任意处继续');
    }

    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 200 });

    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  /** 由场景把指针事件转发进来。返回 true = 事件被浮层吃掉。 */
  pointerDown(y: number): boolean {
    if (!this.running) return false;
    this.armed = true; // 见过按下了，之后的抬手才算一次点击
    this.dragFrom = y;
    return true;
  }

  pointerMove(y: number): boolean {
    if (!this.running || this.dragFrom === null) return false;
    if (this.contentHeight <= this.viewHeight) return true;
    const dy = y - this.dragFrom;
    this.scrollY = Phaser.Math.Clamp(this.scrollY - dy, 0, this.contentHeight - this.viewHeight);
    this.bodyLayer.setY(this.bodyLayer.y + dy);
    this.scrollY = Phaser.Math.Clamp(this.scrollY, 0, this.contentHeight - this.viewHeight);
    this.dragFrom = y;
    return true;
  }

  pointerUp(y: number): boolean {
    if (!this.running) return false;
    // 打开它的那一次点击的抬手：吃掉，但不关。见 armed 的注释。
    if (!this.armed) {
      this.dragFrom = null;
      return true;
    }
    const moved = this.dragFrom !== null && Math.abs(y - this.dragFrom) > 10;
    this.dragFrom = null;
    if (!moved) this.hide();
    return true;
  }

  hide(): void {
    if (!this.running) return;
    this.running = false;
    this.container.setVisible(false);
    const done = this.resolve;
    this.resolve = null;
    done?.();
  }
}
