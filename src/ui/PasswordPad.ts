/**
 * 密码盘浮层（第二章 · 保险柜）
 *
 * 玩家自己拨号：输对了 resolve(true)，输错了**不关面板**，只回一句
 * 「转盘弹回原位。」再清空重来（对应剧本里那句台词）。
 *
 * 面板本身不判断「该不该知道密码」——那是航海日志与旧书两条线索的事。
 */

import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { FONT_SANS, FONT_SERIF, makeButton, toCss } from './theme';

/** 保险柜是四位的（0808） */
const SLOT_COUNT = 4;

const PANEL_W = 560;
const PANEL_H = 700;
const PANEL_CX = GAME_WIDTH / 2;
const PANEL_CY = 600;

const SLOT_H = 92;
const SLOT_GAP = 18;
const SLOT_Y = 410;

const KEY_W = 140;
const KEY_H = 84;
const KEY_GAP_X = 20;
const KEY_TOP = 570;
const KEY_PITCH_Y = 98;

/** 数字键整行的宽度（3 键 + 2 间距） */
const ROW_W = 3 * KEY_W + 2 * KEY_GAP_X; // 460

/**
 * 四位数字窗铺满和数字键一样的宽度。
 *
 * 原来是写死的 74 宽 + 18 间距、总共只有 350 —— 比键盘窄 110px，
 * 左右各差 55px，四个框没有一列和数字键对齐，读起来是两个不相干的控件。
 * 4 格对 3 键做不到逐列对齐，但外沿必须齐。
 */
const SLOT_W = Math.floor((ROW_W - (SLOT_COUNT - 1) * SLOT_GAP) / SLOT_COUNT); // 101

const DIGIT_FONT_SIZE = 28;
const ACTION_FONT_SIZE = 20;

/** 输错时的反馈色（比 COLORS.danger 亮，暗底上才看得清） */
const ERROR_COLOR = 0xd08a7a;

const D_SHADE = 840;
const D_PANEL = 841;
const D_CONTENT = 842;
const D_KEY = 843;

type PadObject = Phaser.GameObjects.Text | Phaser.GameObjects.Rectangle;

export interface PasswordOptions {
  /** 面板标题，例如「保险柜」 */
  readonly title: string;
  /** 正确密码 */
  readonly answer: string;
  /** 输错时显示的一句反馈 */
  readonly wrongText: string;
}

export class PasswordPad {
  private readonly scene: Phaser.Scene;
  private readonly objects: PadObject[] = [];
  private readonly titleText: Phaser.GameObjects.Text;
  private readonly hintText: Phaser.GameObjects.Text;
  private readonly slotTexts: Phaser.GameObjects.Text[] = [];
  /** 按键中心坐标，按显示文字索引。只给开发钩子用，免得烟测脚本写死键盘坐标。 */
  private readonly keyPos = new Map<string, { x: number; y: number }>();

  private answer = '';
  private wrongText = '';
  private entry = '';
  private running = false;
  private resolve: ((ok: boolean) => void) | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // 遮罩：顺手吃掉面板外的点击，免得误触到底下的道具栏
    this.reg(
      scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x05070a, 0.78),
      D_SHADE,
    ).setInteractive();

    this.reg(
      scene.add
        .rectangle(PANEL_CX, PANEL_CY, PANEL_W, PANEL_H, 0x0e1519, 1)
        .setStrokeStyle(1, 0x33454f),
      D_PANEL,
    );

    this.titleText = this.reg(
      scene.add
        .text(PANEL_CX, 300, '', {
          fontFamily: FONT_SERIF,
          fontSize: '26px',
          color: toCss(COLORS.ink),
        })
        .setOrigin(0.5),
      D_CONTENT,
    );

    this.reg(scene.add.rectangle(PANEL_CX, 340, PANEL_W - 80, 1, 0x33454f, 0.9), D_CONTENT);

    // 四位数字窗
    const slotTotal = SLOT_COUNT * SLOT_W + (SLOT_COUNT - 1) * SLOT_GAP;
    const slotStartX = PANEL_CX - slotTotal / 2;
    for (let i = 0; i < SLOT_COUNT; i++) {
      const cx = slotStartX + i * (SLOT_W + SLOT_GAP) + SLOT_W / 2;
      this.reg(
        scene.add
          .rectangle(cx, SLOT_Y, SLOT_W, SLOT_H, 0x131c21, 1)
          .setStrokeStyle(1, 0x2e4049),
        D_CONTENT,
      );
      this.slotTexts.push(
        this.reg(
          scene.add
            .text(cx, SLOT_Y, '·', {
              fontFamily: FONT_SERIF,
              fontSize: '44px',
              color: toCss(COLORS.ink),
            })
            .setOrigin(0.5),
          D_CONTENT,
        ),
      );
    }

    this.hintText = this.reg(
      scene.add
        .text(PANEL_CX, 500, '', {
          fontFamily: FONT_SANS,
          fontSize: '19px',
          color: toCss(COLORS.inkDim),
        })
        .setOrigin(0.5),
      D_CONTENT,
    );

    // 数字键盘：1-9，第四行 清空 / 0 / 确认
    const rowW = 3 * KEY_W + 2 * KEY_GAP_X;
    const keyStartX = PANEL_CX - rowW / 2 + KEY_W / 2;
    const colX = (col: number) => keyStartX + col * (KEY_W + KEY_GAP_X);

    for (let n = 1; n <= 9; n++) {
      const col = (n - 1) % 3;
      const row = Math.floor((n - 1) / 3);
      this.addKey(colX(col), KEY_TOP + row * KEY_PITCH_Y, String(n), () => this.press(String(n)), FONT_SERIF, DIGIT_FONT_SIZE);
    }
    this.addKey(colX(0), KEY_TOP + 3 * KEY_PITCH_Y, '清空', () => this.clearEntry(), FONT_SANS, ACTION_FONT_SIZE, KEY_W, KEY_H, {
      // 「清空」是有破坏性的次要操作：跟背景同色、只剩一圈描边，退到后面去
      fill: 0x0e1519,
      hover: 0x1b262c,
      stroke: 0x33454f,
    });
    this.addKey(colX(1), KEY_TOP + 3 * KEY_PITCH_Y, '0', () => this.press('0'), FONT_SERIF, DIGIT_FONT_SIZE);
    this.addKey(colX(2), KEY_TOP + 3 * KEY_PITCH_Y, '确认', () => this.confirm(), FONT_SANS, ACTION_FONT_SIZE, KEY_W, KEY_H, {
      // 主操作实心化。原来和数字键、清空是同一个 #162026，
      // 三个语义完全不同的东西长得一模一样。
      fill: 0x6f5716,
      hover: 0x8a6d1c,
      stroke: 0xb08a24,
    });

    this.addKey(PANEL_CX + PANEL_W / 2 - 34, 300, '×', () => this.finish(false), FONT_SANS, 24, 44, 44);
  }

  get isActive(): boolean {
    return this.running;
  }

  /** 打开面板；resolve(true) = 密码正确，resolve(false) = 玩家关掉了 */
  show(options: PasswordOptions): Promise<boolean> {
    if (this.running) return Promise.resolve(false);
    if (options.answer.length !== SLOT_COUNT) {
      console.warn(`[PasswordPad] 答案「${options.answer}」不是 ${SLOT_COUNT} 位`);
    }

    this.answer = options.answer;
    this.wrongText = options.wrongText;
    this.entry = '';
    this.titleText.setText(options.title);
    this.hintText.setText('').setColor(toCss(COLORS.inkDim));
    this.paintSlots();
    this.setVisible(true);

    this.running = true;
    return new Promise<boolean>((resolve) => {
      this.resolve = resolve;
    });
  }

  hide(): void {
    this.finish(false);
  }

  // ── 内部 ─────────────────────────────────────────────

  private addKey(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    font: string,
    fontSize: number,
    width = KEY_W,
    height = KEY_H,
    skin: { fill?: number; hover?: number; stroke?: number } = {},
  ): void {
    const btn = makeButton(this.scene, x, y, label, onClick, {
      width,
      height,
      fontSize,
      font,
      fill: skin.fill ?? 0x162026,
      hover: skin.hover ?? 0x24343d,
      stroke: skin.stroke ?? 0x2e4049,
    });
    this.keyPos.set(label, { x, y });
    this.reg(btn.rect, D_KEY);
    this.reg(btn.label, D_KEY + 1);
  }

  /** 仅供开发钩子：按键文字 → 屏幕坐标。 */
  devKeys(): Record<string, { x: number; y: number }> {
    return Object.fromEntries(this.keyPos);
  }

  private reg<T extends PadObject>(o: T, depth: number): T {
    o.setDepth(depth);
    o.setVisible(false);
    this.objects.push(o);
    return o;
  }

  private setVisible(visible: boolean): void {
    for (const o of this.objects) o.setVisible(visible);
  }

  private paintSlots(): void {
    for (let i = 0; i < this.slotTexts.length; i++) {
      this.slotTexts[i]!.setText(this.entry[i] ?? '·');
    }
  }

  private press(digit: string): void {
    if (!this.running || this.entry.length >= SLOT_COUNT) return;
    this.entry += digit;
    this.hintText.setText('').setColor(toCss(COLORS.inkDim));
    this.paintSlots();
  }

  private clearEntry(): void {
    if (!this.running) return;
    this.entry = '';
    this.hintText.setText('').setColor(toCss(COLORS.inkDim));
    this.paintSlots();
  }

  private confirm(): void {
    if (!this.running) return;
    if (this.entry.length < SLOT_COUNT) {
      this.hintText.setText('还没拨完。').setColor(toCss(COLORS.inkDim));
      return;
    }
    if (this.entry === this.answer) {
      this.finish(true);
      return;
    }
    // 输错：弹回原位，重来
    this.entry = '';
    this.paintSlots();
    this.hintText.setText(this.wrongText).setColor(toCss(ERROR_COLOR));
  }

  /**
   * 唯一的收尾出口。
   * 注意顺序：先把 resolve 取出来再置空 —— 反过来的话 Promise 永远不会
   * settle，await 它的调用方会连同 busy 闸门一起卡死（这个 bug 真踩过）。
   */
  private finish(ok: boolean): void {
    const done = this.resolve;
    this.resolve = null;
    this.running = false;
    this.entry = '';
    this.setVisible(false);
    done?.(ok);
  }
}
