/**
 * 旁白 / 对白文本框（设计文档 9.1）
 *
 * 顶边固定、底边跟着这一行的行数收 —— 台词永远从同一个 y 开始，
 * 所以读起来不会上下跳；面板本身贴着文字，多出来的地还给场景
 *（原来是一块写死 292px 高的板子，一行 6 字也要占满，其中 180px 是空的）。
 * 打字机逐字显示；点击时：正在打字 → 立刻显示整行，整行已显示 → 下一行。
 */

import type Phaser from 'phaser';

import { COLORS, GAME_WIDTH, STAGE_HEIGHT } from '../config';
import { FONT_SANS, FONT_SERIF, toCss } from './theme';
import { cjkWrap } from './cjkWrap';

/** 面板顶边固定不动：台词永远从同一个位置开始，换行也不会整块上下跳 */
const PANEL_TOP = 812;
/**
 * 面板底边正好顶到道具栏的顶边。
 * 早先写的是 1096，跟 1104 的道具栏之间留了 7px 缝，露出场景的地面色，
 * 看上去像面板没对齐（截图 02 实测）。现在直接取舞台高度。
 */
const PANEL_BOTTOM = STAGE_HEIGHT;
/** 正文距面板顶的距离（先给说话人留出位置） */
const BODY_OFFSET = 62;

export class TextBox {
  private readonly container: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly bottomLine: Phaser.GameObjects.Rectangle;
  private readonly speaker: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly caret: Phaser.GameObjects.Text;

  private lines: readonly string[] = [];
  private index = 0;
  private reveal?: Phaser.Time.TimerEvent;
  private resolve: (() => void) | null = null;
  private running = false;

  constructor(private readonly scene: Phaser.Scene) {
    const height = PANEL_BOTTOM - PANEL_TOP;

    this.bg = scene.add.rectangle(0, PANEL_TOP, GAME_WIDTH, height, 0x080b0e, 0.9).setOrigin(0, 0);
    const topLine = scene.add.rectangle(0, PANEL_TOP, GAME_WIDTH, 1, 0x33454f, 0.9).setOrigin(0, 0);
    this.bottomLine = scene.add.rectangle(0, PANEL_BOTTOM, GAME_WIDTH, 1, 0x33454f, 0.5).setOrigin(0, 0);

    this.speaker = scene.add.text(36, PANEL_TOP + 22, '', {
      fontFamily: FONT_SANS,
      fontSize: '19px',
      color: toCss(COLORS.accent),
    });

    this.body = scene.add.text(36, PANEL_TOP + BODY_OFFSET, '', {
      fontFamily: FONT_SERIF,
      fontSize: '22px',
      color: toCss(COLORS.ink),
      lineSpacing: 12,
      wordWrap: { width: GAME_WIDTH - 84, callback: cjkWrap },
    });

    // 全屏唯一告诉玩家"点一下继续"的东西，早先是 18px 的 inkDim，
    // 实测墨迹只有 9px 宽、还贴在面板最下缘。放大 + 提亮。
    this.caret = scene.add
      .text(GAME_WIDTH - 40, PANEL_BOTTOM - 38, '▼', {
        fontFamily: FONT_SANS,
        fontSize: '24px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(1, 0);

    this.container = scene.add.container(0, 0, [this.bg, topLine, this.bottomLine, this.speaker, this.body, this.caret]);
    this.container.setDepth(500).setVisible(false);
  }

  get isActive(): boolean {
    return this.running;
  }

  /** 展示一段文本；返回的 Promise 在玩家点完最后一行后 resolve */
  show(who: string | undefined, lines: readonly string[]): Promise<void> {
    this.lines = lines.length > 0 ? lines : [''];
    this.index = 0;
    this.running = true;
    this.container.setVisible(true);
    this.container.setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 160 });
    this.speaker.setText(who ?? '');
    this.renderLine();

    return new Promise<void>((res) => {
      this.resolve = res;
    });
  }

  /** 玩家点击。返回 true 表示这一下被文本框吃掉了，不应再触发热点。 */
  tap(): boolean {
    if (!this.running) return false;

    if (this.reveal) {
      // 正在逐字：先把整行显示完
      this.reveal.remove();
      this.reveal = undefined;
      this.body.setText(this.lines[this.index] ?? '');
      this.caret.setVisible(true);
      return true;
    }

    if (this.index < this.lines.length - 1) {
      this.index += 1;
      this.renderLine();
      return true;
    }

    this.hide();
    return true;
  }

  /** 立刻收起（用于离开场景 / 跳过）。挂起中的 show() 会就此 resolve。 */
  hide(): void {
    this.reveal?.remove();
    this.reveal = undefined;
    this.container.setVisible(false);
    this.running = false;
    // 必须先取出再清空：resolve 一旦丢失，await show() 的那条剧情链就永远挂住，
    // 场景的 busy 标志再也不会复位 —— 之后所有点击都会被静默吞掉。
    const done = this.resolve;
    this.resolve = null;
    done?.();
  }

  /**
   * 面板高度跟着这一行的行数走。
   *
   * 顶边不动，所以台词本身不会上下跳（"不随文字长短跳动"的原意）；
   * 但一行 6 字的短台词配一块 291px 高的面板、其中 180px 是空的，
   * 而唯一提示"点一下继续"的三角被推到最下缘 —— 两头都别扭。
   * 现在面板贴着文字收，多的那块地还给场景。
   */
  private layout(lineHeight: number): void {
    const h = Math.min(PANEL_BOTTOM - PANEL_TOP, Math.max(96, BODY_OFFSET + lineHeight + 26));
    this.bg.setSize(GAME_WIDTH, h);
    this.bottomLine.setY(PANEL_TOP + h);
    this.caret.setY(PANEL_TOP + h - 38);
  }

  private renderLine(): void {
    const full = this.lines[this.index] ?? '';
    this.caret.setVisible(false);

    if (full.length === 0) {
      this.body.setText('');
      this.layout(0);
      this.caret.setVisible(true);
      return;
    }

    // 先拿整行文字量一次高度。逐字显示时 body.height 是一路往上涨的，
    // 拿它当依据，面板会在打字过程中一直抽动。
    this.body.setText(full);
    this.layout(this.body.height);

    // 中文逐字；标点稍作停顿的细腻感留给打磨阶段
    let n = 0;
    this.body.setText('');
    this.reveal = this.scene.time.addEvent({
      delay: 22,
      loop: true,
      callback: () => {
        n += 1;
        this.body.setText(full.slice(0, n));
        if (n >= full.length) {
          this.reveal?.remove();
          this.reveal = undefined;
          this.caret.setVisible(true);
        }
      },
    });
  }
}
