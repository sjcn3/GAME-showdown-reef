import Phaser from 'phaser';

import { COLORS, GAME_WIDTH } from '../config';
import { ALL_ITEM_IDS, ITEMS, type ItemId } from '../data/items';
import { ENDINGS } from '../data/endings';
import { MAX_FUMBLES } from '../core/EndingResolver';
import { gameState } from '../store';
import { FONT_SANS, FONT_SERIF, makeButton, toCss, type Button } from '../ui/theme';

const KIND_LABEL: Record<string, string> = {
  key: '关键道具',
  clue: '线索',
  tool: '工具',
  extra: '物证',
};

const ROW_TOP = 168;
const ROW_STEP = 60;

/**
 * 判定表调试面板。
 * 直接操作 gameState，实时显示解析结果 —— 让设计文档 7 的判定表可以当场验证。
 */
export class DebugScene extends Phaser.Scene {
  private toggles = new Map<ItemId, Button>();
  private fumbleButton!: Button;
  private resultText!: Phaser.GameObjects.Text;
  private metaText!: Phaser.GameObjects.Text;

  constructor() {
    super('Debug');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(COLORS.bg);

    this.add
      .text(GAME_WIDTH / 2, 56, '结局判定表', {
        fontFamily: FONT_SERIF,
        fontSize: '32px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    this.add
      .text(GAME_WIDTH / 2, 100, '点亮你找到的证据，实时看结局怎么变', {
        fontFamily: FONT_SANS,
        fontSize: '17px',
        color: toCss(COLORS.inkDim),
      })
      .setOrigin(0.5);

    // ── 道具开关 ───────────────────────────────
    ALL_ITEM_IDS.forEach((id, i) => {
      const def = ITEMS[id];
      const btn = makeButton(
        this,
        GAME_WIDTH / 2,
        ROW_TOP + i * ROW_STEP,
        '',
        () => {
          if (gameState.has(id)) gameState.items.delete(id);
          else gameState.addItem(id);
          this.refresh();
        },
        { width: 640, height: 50, fontSize: 19, textColor: COLORS.ink },
      );
      this.toggles.set(id, btn);
    });

    // ── 破绽 ──────────────────────────────────
    this.fumbleButton = makeButton(
      this,
      GAME_WIDTH / 2,
      ROW_TOP + ALL_ITEM_IDS.length * ROW_STEP + 22,
      '',
      () => {
        gameState.fumbleCount = (gameState.fumbleCount + 1) % (MAX_FUMBLES + 1);
        this.refresh();
      },
      { width: 640, height: 50, fontSize: 19 },
    );

    // ── 结果 ──────────────────────────────────
    this.metaText = this.add
      .text(GAME_WIDTH / 2, 908, '', {
        fontFamily: FONT_SANS,
        fontSize: '18px',
        color: toCss(COLORS.inkDim),
        align: 'center',
        lineSpacing: 6,
      })
      .setOrigin(0.5);

    this.resultText = this.add
      .text(GAME_WIDTH / 2, 1000, '', {
        fontFamily: FONT_SERIF,
        fontSize: '26px',
        color: toCss(COLORS.accent),
        align: 'center',
        lineSpacing: 10,
      })
      .setOrigin(0.5);

    makeButton(this, 190, 1160, '重置', () => {
      gameState.reset();
      this.refresh();
    }, { width: 220, height: 58, fontSize: 20 });

    makeButton(this, 530, 1160, '播放此结局', () => {
      this.scene.start('Ending', { resolved: gameState.resolve() });
    }, { width: 260, height: 58, fontSize: 20 });

    makeButton(this, GAME_WIDTH / 2, 1238, '返回标题', () => {
      this.scene.start('Title');
    }, { width: 300, height: 50, fontSize: 17, textColor: COLORS.inkDim });

    this.refresh();
  }

  private refresh(): void {
    for (const [id, btn] of this.toggles) {
      const def = ITEMS[id];
      const owned = gameState.has(id);
      btn.setLabel(`${owned ? '◆' : '◇'}  ${def.name}　〔${KIND_LABEL[def.kind]}〕`);
      btn.setActive(owned);
    }

    this.fumbleButton.setLabel(`对峙破绽：${gameState.fumbleCount}　（点按切换 0–${MAX_FUMBLES}）`);
    this.fumbleButton.setActive(gameState.fumbleCount > 0);

    const r = gameState.resolve();

    const tag = r.forcedWorst
      ? '破绽满 → 强制最坏'
      : r.downgraded
        ? `降级：${ENDINGS[r.base].name} → ${r.final === r.base ? r.base : ENDINGS[r.final].name}`
        : '未降级';

    this.metaText.setText(
      `关键道具 K = ${r.keyCount} / 2　　常规线索 C = ${r.clueCount} / 5\n` +
        `基础结局：${ENDINGS[r.base].name}（L${ENDINGS[r.base].level}）　·　${tag}`,
    );

    this.resultText.setText(`${r.def.name}`);
    this.resultText.setColor(toCss(r.final === 'tipped_off' ? COLORS.danger : COLORS.accent));
  }
}
