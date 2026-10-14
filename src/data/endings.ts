/**
 * 结局定义与文案
 * 对应设计文档 7 / 剧本全文「结局全文」。
 *
 * 层级（由好到坏）：
 *   L1 潮落  →  L2 残页  →  L3 遗徽 / 断号  →  L4 无证之胜  →  L5 打草惊蛇
 */

import type { ItemId } from './items';

export type EndingId =
  | 'tide_ebb' // 潮落（完美）
  | 'torn_page' // 残页（准完美）
  | 'lost_emblem' // 遗徽
  | 'broken_number' // 断号
  | 'hollow_win' // 无证之胜
  | 'tipped_off'; // 打草惊蛇

export type EndingLevel = 1 | 2 | 3 | 4 | 5;

/** 正文中会被动态句替换的占位符 */
export const DETAIL_SLOT = '{{detail}}';

export interface EndingDef {
  readonly id: EndingId;
  readonly name: string;
  readonly level: EndingLevel;
  /** 结局图鉴里的一句话摘要 */
  readonly summary: string;
  /** 触发条件（人类可读，用于调试面板） */
  readonly condition: string;
  /**
   * 图鉴里未解锁时显示的一句话。
   *
   * 图鉴**绝不能**把 `condition` 直接摆给玩家：六张卡翻一遍就等于拿到完整判定表，
   * 而卡片标题还摆着「？ ？ ？」卖关子 —— 自相矛盾，也把探索乐趣一次泄光。
   * 条件只在解锁后（调试面板里）才示人，未解锁时用这句不给条件、只给气氛的短句。
   */
  readonly lockedHint: string;
  /** 正文段落；含 DETAIL_SLOT 的段落会被动态句替换 */
  readonly body: readonly string[];
  /** 结局底图色调（同构图改色，见设计文档 10.2） */
  readonly frameTint: number;
}

export const ENDINGS: Readonly<Record<EndingId, EndingDef>> = {
  tide_ebb: {
    id: 'tide_ebb',
    name: '潮落',
    level: 1,
    summary: '证据链完整，保护伞落网。潮水退去，礁石露了出来。',
    condition: '2 个关键道具 + 5 条常规线索',
    lockedHint: '潮水退下去的时候，礁石才会露出来。',
    frameTint: 0x9a7038,
    body: [
      '你先出示蛇形铜徽，戳破陈老板的身份，证明这起走私与十年前的旧案是同一团伙；再拿出半块警号牌，厉声让右侧的“李副局长”拿出另一半。',
      '证据链完整：切割痕迹证明内部改装、烟蒂锁定管理层身份、航海日志对应走私路线、名单残页坐实受贿，铜徽 + 警号牌直接关联当年父亲殉职案。',
      '警笛声逼近，李副局长和陈老板双双落网。',
      '你在父亲的旧办公桌上，将两半警号牌拼合，和蛇形铜徽一起放进证物袋。',
      '窗外沧澜港的潮水退去，码头终于露出了干净的礁石。',
    ],
  },

  torn_page: {
    id: 'torn_page',
    name: '残页',
    level: 2,
    summary: '案子破了，但最上面的那个人还在原来的位置上坐着。',
    condition: '2 个关键道具 + 3~4 条常规线索',
    lockedHint: '有些卷宗翻到最后一页，才发现缺了一角。',
    frameTint: 0x3f6f9c,
    body: [
      '你出示了蛇形铜徽，陈老板脸上的笑没变，但眼神死了；你拿出半块警号牌，右侧那个戴口罩的人，肩膀几不可察地塌了一下。',
      '但这不够。',
      DETAIL_SLOT,
      '李副局长在最关键的那一刻，被一个电话叫走了。第二天，一份措辞严谨的说明送到了专案组：他当晚只是“例行巡查”。',
      '陈老板把所有事都扛了下来。',
      '案子破了，走私网络被连根拔起，你得到了该有的荣誉。陈老板被判了重刑，判得甚至比应得的还重——因为他必须一个人扛完。',
      '但每次翻开卷宗，那道缺角都在提醒你：最上面的那个人，还在原来的位置上坐着。',
      '潮水退去，礁石露了出来——但礁石上那道刻痕，你始终没能看清是谁留下的。',
    ],
  },

  lost_emblem: {
    id: 'lost_emblem',
    name: '遗徽',
    level: 3,
    summary: '走私网络被捣毁，却始终无法与父亲的旧案关联。',
    condition: '缺少「蛇形铜徽」+ 常规线索 ≥3 条',
    frameTint: 0x74508f,
    lockedHint: '铜徽只剩半枚，另一半在谁手里？',
    body: [
      '凭借提货单、航海日志和名单残页，你成功查获了整批走私货，抓获了陈老板，但始终无法证明这个团伙和父亲当年的案子有关。',
      '李副局长以“分管领导亲临现场指挥”的身份全身而退，还在表彰会上给你颁奖。',
      '你站在码头，知道蛇形标记的主人还藏在更上层，父亲的死因依旧是悬案。',
      '那枚铜徽，永远留在了你没找到的暗格里，也留在了那个看不见的阴影里。',
    ],
  },

  broken_number: {
    id: 'broken_number',
    name: '断号',
    level: 3,
    summary: '网络覆灭，却无法指认那个保护伞。警号的另一半，成了心里拔不掉的刺。',
    condition: '缺少「半块警号牌」+ 常规线索 ≥3 条',
    frameTint: 0x2f7a63,
    lockedHint: '警号断成两截，人就查不到了。',
    body: [
      '蛇形铜徽和完整的走私证据链，成功捣毁了这个盘踞多年的走私网络，也印证了父亲当年的调查方向完全正确。',
      '但没有警号牌作为物证，你始终无法指认李副局长就是那个保护伞。',
      '你看着他从办公室门口从容离开，知道他就是当年害死父亲的人，却没有任何证据。',
      '你把蛇形铜徽挂在自己的钥匙串上，决定留在沧澜港，慢慢等，等他露出马脚的那一天。',
      '警号的另一半，成了你心里拔不掉的刺。',
    ],
  },

  hollow_win: {
    id: 'hollow_win',
    name: '无证之胜',
    level: 4,
    summary: '下层团伙一网打尽，核心人物一个都没抓到。这只是打掉了一个手脚。',
    condition: '0 个关键道具 + 常规线索 ≥3 条',
    frameTint: 0x5a6b3a,
    lockedHint: '赢了，可证人席上一个人也没有。',
    body: [
      '所有走私证据都齐了，货物、航线、人员名单全部坐实，下层团伙一网打尽，案件顺利告破，你获得了局里的通报表彰。',
      DETAIL_SLOT,
      '但陈老板咬死不承认背后有人，李副局长全程没有露面，你既没法关联旧案，也抓不到保护伞。',
      '大家都说这是大胜仗，只有你清楚：核心人物一个都没抓到，这只是打掉了一个手脚。',
      '你把卷宗放进档案柜，窗外的码头依旧灯火通明，走私的船，还会再来。',
    ],
  },

  tipped_off: {
    id: 'tipped_off',
    name: '打草惊蛇',
    level: 5,
    summary: '证据不足，强行行动。消息从内部走漏了。',
    condition: '常规线索 ≤2 条（任意关键道具数），或破绽满 3',
    frameTint: 0x9c3a2f,
    lockedHint: '雨还没停，仓库里的人先走了。',
    body: [
      '证据不足，你还是强行申请了行动。等你冲到仓库时，早已人去楼空，只留下几个空箱子。',
      '很快，局里的处分下来了：“行动鲁莽，打草惊蛇”，你被停职调查。',
      '后来你才知道，消息是从内部走漏的。走私团伙换了更隐蔽的路线，沧澜港的象牙、穿山甲走私反而变本加厉。',
      '你站在父亲的墓碑前，手里只有半张模糊的提货单。',
      '风从港口吹过来，带着海水的咸味，像一声叹息。',
    ],
  },
};

/** 打草惊蛇 · 未申请支援版：替换正文第一段 */
export const TIPPED_OFF_NO_BACKUP_FIRST_PARAGRAPH =
  '你连支援都没等，一个人推开了仓库门。里面是空的。防雨布下面，连一个箱子都没有。你才想起来，对讲机还在车上。';

/**
 * 「残页」结局的动态句：按缺失的常规线索生成。
 * 最多并列 2 条（设计文档 7.3）。
 */
export const TORN_PAGE_DETAILS: Readonly<Record<string, string>> = {
  list_fragment: '名单残页上「分管副局长 · 代号『信天翁』」那一行，正好被撕口截断',
  ship_log: '你始终没能说清，还有几条夜航的路线通向哪里',
  mint_cigarette: '你无法证明，码头管理层到底参与到了哪一层',
  altered_manifest: '这批货从哪里来、经过谁的手，链条上缺了关键的一环',
  cut_mark: '你无法证明，这个集装箱是内部人员亲手改装的',
};

/** 缺失线索的排列顺序（固定，保证文案稳定） */
export const TORN_PAGE_DETAIL_ORDER: readonly ItemId[] = [
  'list_fragment',
  'ship_log',
  'mint_cigarette',
  'altered_manifest',
  'cut_mark',
];

/** 「残页」动态句最多并列几条 */
export const TORN_PAGE_MAX_DETAILS = 2;

/** 「无证之胜」结局的动态句：按线索数 */
export const HOLLOW_WIN_DETAILS: Readonly<Record<number, string>> = {
  3: '但有几条航线的去向，你到最后也没能说清楚。',
  4: '但整条链条上，还剩一个说不清的环节。',
  5: '证据是齐的。可证据指向的，始终是下面的人。',
};

/**
 * 破绽失误版收尾（破绽 1~2，结局降级后追加）。
 * 键 = 降级前的「基础结局」。
 */
export const FUMBLE_PARAGRAPHS: Readonly<Record<EndingId, string>> = {
  tide_ebb:
    '但你在最后一句话上慢了半拍。他抓住了那一瞬间的迟疑，反手把话题引到了程序问题上。等你想清楚该怎么接，最好的时机已经过去了。',
  torn_page:
    '你本可以再往前走一步。但你说错了一句话，他顺着那句话，把自己从整件事里摘了出去。',
  lost_emblem:
    '你手里的东西是真的。可你没能把它们串成一条链——对方只用三个问题，就把你的顺序打乱了。',
  broken_number:
    '你手里的东西是真的。可你没能把它们串成一条链——对方只用三个问题，就把你的顺序打乱了。',
  hollow_win: '你连自己手里的东西都没讲清楚。他听完，笑了一下，然后就走了。',
  tipped_off: '',
};

/** 破绽满 3 时的强制收束段（进入打草惊蛇前播放） */
export const FUMBLE_OVERFLOW_TEXT = [
  '**戴口罩的人**：“行了。”',
  '他转身，走进办公室，把门带上了。',
  '我站在原地，手里还举着那件没用的东西。',
];

export const ENDING_ORDER: readonly EndingId[] = [
  'tide_ebb',
  'torn_page',
  'lost_emblem',
  'broken_number',
  'hollow_win',
  'tipped_off',
];
