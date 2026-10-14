import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { CHAPTER_FIRST_SCENE } from '../data/chapters';
import { ENDINGS } from '../data/endings';
import { unlockEnding } from '../core/SaveManager';
import { playSfx } from '../core/Sfx';
import { gameState } from '../store';
import type { ResolvedEnding } from '../core/EndingResolver';
import { FONT_SANS, FONT_SERIF, drawRule, makeButton, toCss } from '../ui/theme';
import { cjkWrap } from '../ui/cjkWrap';
import { paintEndingPlate } from '../art/placeholders';

interface EndingData {
  readonly resolved?: ResolvedEnding;
  /** 调试面板预览时不写存档 */
  readonly preview?: boolean;
}

/**
 * 版面分成三个**固定槽位**：正文、插画、按钮。
 *
 * 这里以前是「正文多高，插画就跟着往下排，排不下就干脆不画」——
 * 后果是文案最长的两个结局（无证之胜、打草惊蛇）插画被整块跳过，
 * 屏幕下半截留一大片空白，而正文还会一路排到按钮下面把最后一行切掉。
 * 版面不允许由文案长度决定：**槽位固定，让字号去适应槽位**。
 */
const BODY_TOP = 246;
const BODY_BOTTOM = 772;
const BODY_WIDTH = 596;
/** 正文字号阶梯：从大到小试，塞得进槽位就用哪一号 */
const BODY_FONT_SIZES = [20, 19, 18, 17, 16, 15, 14] as const;
/** 插画槽位固定，六个结局都画在同一处 */
const PLATE_TOP = 796;
const PLATE_BOTTOM = 1046;
/** 结局色调压多浓：六种色相靠这个 alpha 才拉得开（太小会糊成同一片冷灰） */
const FRAME_TINT_ALPHA = 0.3;

export class EndingScene extends Phaser.Scene {
  private resolved!: ResolvedEnding;
  private preview = false;
  private plateDrawn = false;

  constructor() {
    super('Ending');
  }

  init(data: EndingData): void {
    this.resolved = data.resolved ?? gameState.resolve();
    this.preview = data.preview ?? false;
  }

  create(): void {
    const r = this.resolved;

    this.cameras.main.setBackgroundColor(COLORS.bg);
    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, r.def.frameTint, FRAME_TINT_ALPHA);

    this.add
      .text(GAME_WIDTH / 2, 96, `结局 · ${r.def.name}`, {
        fontFamily: FONT_SERIF,
        fontSize: '36px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    drawRule(this, 142);

    this.add
      .text(
        GAME_WIDTH / 2,
        180,
        `关键道具 ${r.keyCount}/2　·　常规线索 ${r.clueCount}/5　·　破绽 ${r.fumbleCount}` +
          (r.downgraded ? `　·　${ENDINGS[r.base].name} → ${r.def.name}` : ''),
        {
          fontFamily: FONT_SANS,
          fontSize: '16px',
          color: toCss(COLORS.inkDim),
        },
      )
      .setOrigin(0.5);

    // 正文：固定槽位 + 自适应字号。放不下就降一号重新排版再量，
    // 直到塞进槽位为止 —— 宁可字小一点，也不能让最后一段被按钮吃掉。
    let body: Phaser.GameObjects.Text | undefined;
    for (const size of BODY_FONT_SIZES) {
      body?.destroy();
      body = this.add
        .text(GAME_WIDTH / 2, BODY_TOP, r.paragraphs.join('\n\n'), {
          fontFamily: FONT_SERIF,
          fontSize: `${size}px`,
          color: '#aebbc4',
          align: 'left',
          lineSpacing: Math.round(size * 0.6),
          wordWrap: { width: BODY_WIDTH, callback: cjkWrap },
        })
        .setOrigin(0.5, 0);
      if (body.height <= BODY_BOTTOM - BODY_TOP) break;
    }

    // 结局插画：固定槽位。以前是"正文短才配图"，现在六个结局一律有图 ——
    // 插画是这一屏唯一的情绪载体，不该由文案长度决定它存不存在。
    const plate = this.add.graphics();
    paintEndingPlate(plate, 62, PLATE_TOP, GAME_WIDTH - 124, PLATE_BOTTOM - PLATE_TOP, r.def.frameTint);
    this.plateDrawn = true;

    const lastY = GAME_HEIGHT - 150;

    makeButton(this, 190, lastY, '回到标题', () => {
      this.scene.start('Title');
    }, { width: 260, height: 62, fontSize: 20 });

    makeButton(this, 530, lastY, '再玩一次', () => {
      gameState.reset();
      this.scene.start('Explore', { sceneId: CHAPTER_FIRST_SCENE[0]! });
    }, { width: 260, height: 62, fontSize: 20 });

    if (!this.preview) {
      unlockEnding(r.final, gameState.snapshot());
    }
    playSfx(this, 'ending');

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 68, this.preview ? '调试预览 · 未写入图鉴' : '已写入结局图鉴', {
        fontFamily: FONT_SANS,
        fontSize: '14px',
        color: '#3d4b54',
      })
      .setOrigin(0.5);
  }

  /**
   * 开发钩子：把这一屏判成了哪个结局原样报出来。
   * 结局文案是画在 canvas 上的，DOM 里读不到 —— 没有这个口子，
   * 烟测脚本只能靠截图比对，判错了也不知道。
   */
  devEnding(): {
    id: string;
    name: string;
    base: string;
    downgraded: boolean;
    forcedWorst: boolean;
    keyCount: number;
    clueCount: number;
    fumbleCount: number;
    /** 结局插画是否真的画出来了（短文案才有位置） */
    plate: boolean;
  } {
    const r = this.resolved;
    return {
      id: r.final,
      name: r.def.name,
      base: r.base,
      downgraded: r.downgraded,
      forcedWorst: r.forcedWorst,
      keyCount: r.keyCount,
      clueCount: r.clueCount,
      fumbleCount: r.fumbleCount,
      plate: this.plateDrawn,
    };
  }
}
