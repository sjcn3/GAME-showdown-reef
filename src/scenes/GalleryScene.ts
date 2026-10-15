import Phaser from 'phaser';

import { COLORS, GAME_WIDTH } from '../config';
import { ENDINGS, ENDING_ORDER } from '../data/endings';
import { load } from '../core/SaveManager';
import { FONT_SANS, FONT_SERIF, makeButton, toCss } from '../ui/theme';
import { cjkWrap } from '../ui/cjkWrap';
import { paintEndingPlate } from '../art/endingPlates';

/** 结局图鉴：6 格。未解锁灰显 + 编号。 */
export class GalleryScene extends Phaser.Scene {
  constructor() {
    super('Gallery');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.add
      .text(GAME_WIDTH / 2, 70, '结局图鉴', {
        fontFamily: FONT_SERIF,
        fontSize: '34px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    const unlocked = new Set(load().unlockedEndings);

    this.add
      .text(GAME_WIDTH / 2, 118, `${unlocked.size} / ${ENDING_ORDER.length}`, {
        fontFamily: FONT_SANS,
        fontSize: '18px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5);

    // 这里有一行图例：全游戏只有图鉴出现「L」，不解释玩家只能猜。
    this.add
      .text(GAME_WIDTH / 2, 152, 'L = 结局层级（1 最好 · 5 最坏）', {
        fontFamily: FONT_SANS,
        fontSize: '13px',
        color: '#3d4b54',
      })
      .setOrigin(0.5);

    ENDING_ORDER.forEach((id, i) => {
      const def = ENDINGS[id];
      const isOpen = unlocked.has(id);
      const cx = i % 2 === 0 ? 200 : 520;
      // 行距 280、卡高 230：原来 260/210 时第三行下面空出 280px 死白，
      // 整页明显偏上轻下重。
      const cy = 306 + Math.floor(i / 2) * 280;

      this.add
        .rectangle(cx, cy, 280, 230, isOpen ? def.frameTint : 0x11171b, isOpen ? 0.22 : 1)
        .setStrokeStyle(1, isOpen ? 0x4a5b66 : 0x222c33);

      // 卡片上半是这一格的插画缩略图。以前锁定卡只有一行「？ ？ ？  」——
      // 玩家翻到图鉴，六个没解锁的格子长得一模一样，等于告诉他"这里还有六件事，
      // 但我不打算给你任何线索"。缩略图给的是**构图**：礁石、卷宗、半枚徽、
      // 断牌、空椅、掀开的布，六张形状差得够远，只看轮廓就能记住"我在哪一格"。
      // 278×113 ≈ 插画本身的 596×250（2.4:1），不拉伸。
      const thumbW = 278;
      const thumbH = 113;
      const thumbTop = cy - 114;
      const plate = this.add.graphics();
      paintEndingPlate(plate, cx - thumbW / 2, thumbTop, thumbW, thumbH, id, def.frameTint);

      if (!isOpen) {
        // 黑纱。必须重到"只剩形状"—— 缩略图要是能看清内容，图鉴就成了剧透页，
        // 玩家不用走到那个结局就知道自己错过了什么。
        this.add.rectangle(cx, cy, 280, 230, 0x0b1116, 0.78);
      }

      this.add
        .text(cx, cy + 23, isOpen ? def.name : '？ ？ ？', {
          fontFamily: FONT_SERIF,
          fontSize: isOpen ? '28px' : '22px',
          color: toCss(isOpen ? COLORS.ink : 0x4a5762),
        })
        .setOrigin(0.5);

      // 未解锁时显示的是**不给条件**的气氛短句，不是 def.condition ——
      // 把条件摊在锁定卡上，等于让玩家翻一遍图鉴就拿到完整判定表。
      this.add
        .text(cx, cy + 46, isOpen ? def.summary : def.lockedHint, {
          fontFamily: FONT_SANS,
          fontSize: '14px',
          color: toCss(isOpen ? COLORS.inkDim : 0x46525b),
          align: 'center',
          wordWrap: { width: 244, callback: cjkWrap },
          lineSpacing: 5,
        })
        .setOrigin(0.5, 0);

      this.add
        .text(cx, cy + 104, `No.${i + 1}　L${def.level}`, {
          fontFamily: FONT_SANS,
          fontSize: '13px',
          color: '#39454d',
        })
        .setOrigin(0.5);
    });

    makeButton(this, GAME_WIDTH / 2, 1160, '返回标题', () => {
      this.scene.start('Title');
    }, { width: 300, height: 60, fontSize: 20 });
  }

  /**
   * 开发钩子：这一屏认为哪些结局已解锁。
   * 烟测靠它断言「打完一局 → 图鉴真的多了一格」，
   * 而不是靠人眼看截图里那行 `1 / 6` 数字。
   */
  devGallery(): { unlocked: string[]; total: number } {
    return { unlocked: [...load().unlockedEndings], total: ENDING_ORDER.length };
  }
}
