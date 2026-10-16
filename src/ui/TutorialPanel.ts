/**
 * 玩法教学浮层（X2）
 *
 * 为什么要有它：这套操作里有两条规矩是**反直觉**的 ——
 * ①道具要「先在栏里拿起、再点场景」才能用（直接点锁、点通风口都没用）；
 * ②点空白处会把手里的道具放下。
 * 这两条靠玩家自己撞出来太贵：撞不出来的人会得到「点了没反应」的结论，
 * 而不是「我少做了一步」。用户调研里第一条卡点就是这个。
 *
 * 什么时候弹：第一章开场那段旁白读完之后，且只在**没弹过**的时候
 * （标记落在存档里，见 GameState 的 `tutorial_seen`）。
 * 左上角常驻一个按钮可以随时再看 —— 教学最怕的就是"关掉即失传"。
 *
 * 关闭的两种走法都留着：面板里的「知道了」按钮，和点面板外的暗底。
 * 暗底的关闭判定挂在背板自己身上（同 EvidenceLog）—— 由场景转发坐标的话，
 * 弹出它的那一次点击本身就落在面板外，会先开后关。
 */

import Phaser from 'phaser';

import { COLORS, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { FONT_SANS, FONT_SERIF, makeButton, toCss } from './theme';

const PANEL_W = 600;
const PANEL_X = (GAME_WIDTH - PANEL_W) / 2;
const PANEL_TOP = 288;
const PANEL_H = 568;
const PANEL_BOTTOM = PANEL_TOP + PANEL_H;
const PAD = 40;
const ROW_TOP = PANEL_TOP + 128;
const ROW_H = 68;

/** 盖在所有浮层之上：它是玩家主动叫出来的，被别的东西压住就白叫了。 */
const DEPTH = 860;

/**
 * 教学条目。
 *
 * 五条对应玩家真会卡住的五件事，措辞压到一行以内 ——
 * 这一段注定是被「扫一眼就关掉」的，写成小作文没人读。
 * 最后一条指的那个按钮就在左上角，和按钮上的「?」对得上。
 */
const LINES: readonly string[] = [
  '点击场景里的东西，搜寻道具和线索',
  '在道具栏点一下道具拿起，再点场景里的目标使用',
  '点击人物或关键道具，推进剧情',
  '线索随时能在道具栏的「证据 ›」里查看',
  '忘了怎么玩，点左上角的「?」再看一遍',
];

export class TutorialPanel {
  private readonly container: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly closeCenter: { x: number; y: number };
  private running = false;
  /** 累计弹出过几次。烟测靠它证明"确实自动弹过一次"，见 devOpens()。 */
  private opens = 0;

  constructor(private readonly scene: Phaser.Scene) {
    const dim = scene.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.9).setOrigin(0, 0);

    // 全屏背板：点面板外关掉。命中列表在它变可见之前就算完了，
    // 所以弹出它的那一次点击不会立刻把它关掉（同 EvidenceLog 的说明）。
    this.backdrop = scene.add
      .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setOrigin(0, 0)
      .setInteractive();
    this.backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.y < PANEL_TOP || p.y > PANEL_BOTTOM) this.close();
    });

    const g = scene.add.graphics();
    g.fillStyle(0x0e1317, 0.98);
    g.fillRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_H);
    g.lineStyle(1, 0x33454f, 1);
    g.strokeRect(PANEL_X, PANEL_TOP, PANEL_W, PANEL_H);
    g.lineStyle(1, 0x33454f, 0.7);
    g.lineBetween(PANEL_X + 28, PANEL_TOP + 96, PANEL_X + PANEL_W - 28, PANEL_TOP + 96);

    const title = scene.add
      .text(GAME_WIDTH / 2, PANEL_TOP + 52, '怎么玩', {
        fontFamily: FONT_SERIF,
        fontSize: '27px',
        color: toCss(COLORS.ink),
      })
      .setOrigin(0.5);

    const items: Phaser.GameObjects.GameObject[] = [this.backdrop, dim, g, title];

    LINES.forEach((text, i) => {
      const cy = ROW_TOP + i * ROW_H;

      // 序号用金色，和「证据 ›」那类可点的提示同色 —— 整块面板里只有
      // 序号是暖色，视线自然顺着 1→5 往下走。
      items.push(
        scene.add
          .text(PANEL_X + PAD, cy, `${i + 1}`, {
            fontFamily: FONT_SANS,
            fontSize: '17px',
            color: toCss(COLORS.accent),
          })
          .setOrigin(0, 0.5),
      );

      items.push(
        scene.add
          .text(PANEL_X + PAD + 30, cy, text, {
            fontFamily: FONT_SANS,
            fontSize: '17px',
            color: toCss(COLORS.ink),
            wordWrap: { width: PANEL_W - PAD * 2 - 30 },
          })
          .setOrigin(0, 0.5),
      );
    });

    const btn = makeButton(
      scene,
      GAME_WIDTH / 2,
      PANEL_TOP + 502,
      '知道了',
      () => this.close(),
      { width: 220, height: 60, fontSize: 22 },
    );
    items.push(btn.rect, btn.label);
    this.closeCenter = { x: GAME_WIDTH / 2, y: PANEL_TOP + 502 };

    this.container = scene.add.container(0, 0, items).setDepth(DEPTH).setVisible(false);
  }

  get isActive(): boolean {
    return this.running;
  }

  open(): void {
    this.running = true;
    this.opens += 1;
    this.container.setVisible(true).setAlpha(0);
    this.scene.tweens.add({ targets: this.container, alpha: 1, duration: 180 });
  }

  close(): void {
    if (!this.running) return;
    this.running = false;
    this.container.setVisible(false);
  }

  /** 仅供开发钩子：面板开着时给出「知道了」的中心点，没开就是 null。 */
  devPanel(): { close: { x: number; y: number } } | null {
    if (!this.running) return null;
    return { close: this.closeCenter };
  }

  /**
   * 仅供开发钩子：累计弹出过几次。
   *
   * 烟测的 settle 会替脚本关掉一切浮层（包括这一层），所以「面板弹出来过没有」
   * 关完之后就问不出来了 —— 只断言 `tutorial() === null` 是恒真的假绿。
   * 计数不会被关掉抹去，这才是能证明 X2 的那条断言。
   */
  devOpens(): number {
    return this.opens;
  }
}
