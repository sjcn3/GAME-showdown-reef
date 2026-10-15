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
/**
 * 面板底色。
 *
 * 抽成常量是因为 `layout()` 里要拿它画两次（实心块 + 渐隐带四角），
 * 两处颜色一旦不同，接缝处就会显出一条深浅不一的分界。
 */
const PANEL_FILL = 0x080b0e;

export class TextBox {
  private readonly container: Phaser.GameObjects.Container;
  /**
   * 面板底。**每次 layout() 都 clear() 重画**，不能用 Rectangle：
   * Rectangle 只有纯色填充，画不出"上半实心、下半渐隐"那条无缝的过渡。
   */
  private readonly bg: Phaser.GameObjects.Graphics;
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
    // 底不能在这里定尺寸：高度由 layout() 按这一行的行数重画。
    this.bg = scene.add.graphics();
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
   *
   * **但"收"只收实心部分，可见范围永远到 `PANEL_BOTTOM`。**
   * 早先实心块直接收在文字下面，于是短台词时下面露出一整条 148px 的场景，
   * 而且底边是一条硬线、每换一行就"啪"地跳一次 —— 露出来的那块地不但没还成，
   * 反而成了画面上一道会动的横杠。现在实心块下面接一段从 0.9 渐隐到 0 的
   * 渐隐带、一路铺到舞台底边：露场景的效果留着，硬边和跳动都没了。
   * 台词越长实心块越高、渐隐带越短；占满三行时渐隐带长度为 0，正好是实心到底。
   */
  private layout(lineHeight: number): void {
    const h = Math.min(PANEL_BOTTOM - PANEL_TOP, Math.max(96, BODY_OFFSET + lineHeight + 26));
    const solidBottom = PANEL_TOP + h;
    const fadeH = PANEL_BOTTOM - solidBottom;

    this.bg.clear();
    // 内容区：实心。文字必须永远坐在实底上，不然读起来是浮的。
    this.bg.fillStyle(PANEL_FILL, 0.9);
    this.bg.fillRect(0, PANEL_TOP, GAME_WIDTH, h);
    if (fadeH > 0) {
      // 渐隐带：四角同色、只让 alpha 从 0.9 掉到 0。
      // 起点 alpha 与实心块相同，所以接缝处看不出分界。
      this.bg.fillGradientStyle(PANEL_FILL, PANEL_FILL, PANEL_FILL, PANEL_FILL, 0.9, 0.9, 0, 0);
      this.bg.fillRect(0, solidBottom, GAME_WIDTH, fadeH);
    }

    this.bottomLine.setY(solidBottom);
    this.caret.setY(solidBottom - 38);
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
