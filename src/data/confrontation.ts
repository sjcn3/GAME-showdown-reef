/**
 * 第三章 · 对峙（设计文档 6.3 / 6.4）
 *
 * 判定规则本身在 core/EndingResolver.ts（纯函数、已有单测）。
 * 这里只放**台词**与**三个目标的命中区**，两者都不含逻辑。
 *
 * 回合顺序由 CONFRONTATION_ROUNDS 决定（陈老板 → 货箱 → 戴口罩的人），
 * 玩家能选的只有「出示哪一件」—— 收集决定你有什么牌，顺序决定你打得好不好。
 */

import type { Rect } from '../core/Story';

/** 一个可出示的目标 */
export interface ConfrontationTarget {
  /** 命中区（与 art/placeholders.ts 的 paintWarehouseNight 成对设计） */
  readonly rect: Rect;
  /** 调试用名称，不显示给玩家 */
  readonly label: string;
}

/** 键 = CONFRONTATION_ROUNDS 里的回合 id */
export const CONFRONTATION_TARGETS: Readonly<Record<string, ConfrontationTarget>> = {
  // 三个矩形必须互不重叠（否则「点错人」没法判定），由单测钉死。
  // chen 到 x180、crate 从 196 起、chief 从 512 起 —— 三块之间留缝。
  chen: { rect: [40, 418, 140, 382], label: '陈老板（左侧阴影）' },
  crate: { rect: [196, 588, 304, 200], label: '防雨布下的货箱（中间）' },
  chief: { rect: [512, 288, 178, 502], label: '戴口罩的人（右侧办公室门口）' },
};

/** 一个回合的全部台词 */
export interface RoundScript {
  /** 回合开始，对方开口（也含林深的内心活动） */
  readonly prompt: readonly string[];
  /** 出示了正确的牌 */
  readonly correct: readonly string[];
  /** 打偏了，但手里确实有正确的牌 → 破绽 +1，可立即重试 */
  readonly fumble: readonly string[];
  /** 打偏了，且手里根本没有正确的牌 → 不计破绽，剧情推进 */
  readonly passed: readonly string[];
}

export const ROUND_SCRIPTS: Readonly<Record<string, RoundScript>> = {
  chen: {
    prompt: ['小警官，这么大雨，你来干什么？'],
    correct: [
      '我把铜徽扔在他脚边的水洼里。',
      '这个，是你发给兄弟们的吧。',
      '他低头看了一眼，脸上的笑没变，但眼神死了。',
      '……这东西，你从哪弄来的？',
    ],
    fumble: ['这算什么？', '他把东西拨到一边，雨声把他的笑盖过去了一半。'],
    passed: ['小警官，没话说？那就回去吧。', '他往阴影里退了半步，像是懒得再看我一眼。'],
  },
  crate: {
    prompt: ['货你看过了。报关单上写的是什么，你自己看。'],
    correct: [
      '报关单上写的是木制工艺品。',
      '你们的集装箱内壁，是专业工具切的夹层。',
      '你们的船，有七次没报备的夜航。',
      '陈老板，你说这是不是工艺品？',
      '他沉默了。雨声盖过了他的呼吸。',
    ],
    fumble: ['讲这些没用。货你扣了，人你抓了，然后呢？', '他往后靠在货箱上，像是在等一个人。'],
    passed: ['单子你也没带？那你今晚来干什么。', '他笑了一声，伸手拍了拍防雨布。'],
  },
  chief: {
    prompt: [
      '小同志，我是分管这条线的。现场情况，你向我汇报。',
      '名单残页上写着：分管副局长 · 代号「信天翁」。',
      '现场只有一个人符合「分管副局长」。',
    ],
    correct: [
      '十年前，我父亲的警号牌摔成了两半。',
      '这半块，是从昌隆号的保险柜里找到的。',
      '密码是 0808——他殉职的日子。',
      '另一半在谁手上，你比我清楚。',
      '拿出来。',
      '他站着没动。',
      '雨声里，很远的地方，警笛突然近了。',
    ],
    fumble: ['小同志，你情绪不太稳定。', '今天的事，明天到局里再说。'],
    passed: ['你什么材料都没有，就敢拦我？', '他理了理袖口，转身要走。'],
  },
};

/** 撬棍 / 底舱钥匙 —— 判定层直接返回 disabled */
export const DISABLED_LINE = '对峙的时候，这玩意儿没用。';

/** 破绽满 3，被强制收束（设计文档 6.4） */
export const FUMBLE_CAP_LINES: readonly string[] = [
  '行了。',
  '他转身，走进办公室，把门带上了。',
  '我站在原地，手里还举着那件没用的东西。',
];

/** 三个回合走完、进结局前的过渡 */
export const CLOSING_LINES: readonly string[] = [
  '雨还在下。',
  '铁皮屋顶被砸得很响，像是有人在上面走。',
];

/** 点目标时空着手 */
export const NEED_ITEM_HINT = '从道具栏里选一件东西，再点向他。';

/** 点了不是这一回合该应付的人 */
export const WRONG_TARGET_HINT = '先应付眼前这个。';

/** 手里一件能出示的东西都没有时的收场白（放在 passed 之前） */
export const EMPTY_HANDS_LINE = '我摸了摸口袋，什么也拿不出来。';
