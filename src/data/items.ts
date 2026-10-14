/**
 * 道具与线索定义
 * 对应设计文档 5.1 / 5.2 / 5.3。
 *
 * 「关键道具证明的是十年前，常规线索证明的是眼前这批货。」
 *   —— 结局判定表的底层逻辑。
 */

export type ItemKind =
  /** 关键道具：决定结局大类 */
  | 'key'
  /** 常规线索：决定结局大类 */
  | 'clue'
  /** 工具：不参与结局，仅用于解谜 */
  | 'tool'
  /** 附属物证：不参与结局，第三章可出示以丰富文案 */
  | 'extra';

/** 第三章对峙时，一张牌"能打中"哪一类目标 */
export type ConfrontationTag =
  /** 打身份：陈老板 */
  | 'identity'
  /** 打货：防雨布下的货箱 */
  | 'cargo'
  /** 打保护伞：戴口罩的"上级领导" */
  | 'protection';

export type ItemId =
  // ── 关键道具（K）─────────────────────────────
  | 'bronze_emblem'
  | 'badge_half'
  // ── 常规线索（C）─────────────────────────────
  | 'cut_mark'
  | 'mint_cigarette'
  | 'altered_manifest'
  | 'ship_log'
  | 'list_fragment'
  // ── 工具 ────────────────────────────────────
  | 'crowbar'
  | 'hold_key'
  // ── 附属物证 ─────────────────────────────────
  | 'customs_seal'
  | 'ivory_sample';

export interface ItemDef {
  readonly id: ItemId;
  readonly name: string;
  readonly kind: ItemKind;
  /** 道具栏 / 文档浮层里的一句话描述 */
  readonly desc: string;
  /** 第三章可出示的牌面类别；空数组 = 可出示但打不中任何目标 */
  readonly tags: readonly ConfrontationTag[];
}

export const ITEMS: Readonly<Record<ItemId, ItemDef>> = {
  // ── 关键道具 ────────────────────────────────
  bronze_emblem: {
    id: 'bronze_emblem',
    name: '蛇形铜徽',
    kind: 'key',
    desc: '走私集团核心信物。也是父亲当年卧底时的身份凭证。',
    tags: ['identity'],
  },
  badge_half: {
    id: 'badge_half',
    name: '半块警号牌',
    kind: 'key',
    desc: '父亲殉职时摔裂的遗物。背面刻着一个展翅鸟形的记号——信天翁。',
    tags: ['protection'],
  },

  // ── 常规线索 ────────────────────────────────
  cut_mark: {
    id: 'cut_mark',
    name: '夹层切割痕迹',
    kind: 'clue',
    desc: '内壁被专业工具切割出夹层，边缘整齐——是内部人员改装的。',
    tags: ['cargo'],
  },
  mint_cigarette: {
    id: 'mint_cigarette',
    name: '薄荷烟蒂',
    kind: 'clue',
    desc: '码头管理层才拿得到的特供薄荷烟。它出现在老周脚边。',
    tags: [],
  },
  altered_manifest: {
    id: 'altered_manifest',
    name: '涂改提货单',
    kind: 'clue',
    desc: '“木制工艺品”四字下压着原字：象牙雕刻品。落款有蛇形暗记。',
    tags: ['cargo'],
  },
  ship_log: {
    id: 'ship_log',
    name: '油轮航海日志',
    kind: 'clue',
    desc: '最后一页是手写补入的：2026.08.08，锚地以东 7 海里，未报备。',
    tags: ['cargo'],
  },
  list_fragment: {
    id: 'list_fragment',
    name: '保护伞名单残页',
    kind: 'clue',
    desc: '“分管副局长 代号：信天翁”——撕口正好截在这一行之后。',
    tags: [],
  },

  // ── 工具 ───────────────────────────────────
  crowbar: {
    id: 'crowbar',
    name: '撬棍',
    kind: 'tool',
    desc: '柄上缠着褪色的胶带。',
    tags: [],
  },
  hold_key: {
    id: 'hold_key',
    name: '底舱钥匙',
    kind: 'tool',
    desc: '藏在走廊消防栓箱里。锁孔是干净的——最近常开。',
    tags: [],
  },

  // ── 附属物证 ────────────────────────────────
  customs_seal: {
    id: 'customs_seal',
    name: '海关封条',
    kind: 'extra',
    desc: '封条完好，但胶痕是重新压过的。',
    tags: [],
  },
  ivory_sample: {
    id: 'ivory_sample',
    name: '象牙样本',
    kind: 'extra',
    desc: '断面很新。和铜徽一起藏在那道手抠出来的缝里。',
    tags: [],
  },
};

/** 类别中文名。道具栏的格子放不下，只有证据列表用得到。 */
export const ITEM_KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  key: '关键道具',
  clue: '线索',
  tool: '工具',
  extra: '物证',
};

export const ALL_ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** 关键道具（决定 K） */
export const KEY_ITEM_IDS: readonly ItemId[] = ['bronze_emblem', 'badge_half'];

/** 常规线索（决定 C），顺序即设计文档 5.2 的编号顺序 */
export const CLUE_ITEM_IDS: readonly ItemId[] = [
  'cut_mark', // 线索 1
  'mint_cigarette', // 线索 2
  'altered_manifest', // 线索 3
  'ship_log', // 线索 4
  'list_fragment', // 线索 5
];

/** 第三章对峙时灰显不可选（"这玩意儿对峙时没用"） */
export const CONFRONTATION_DISABLED: readonly ItemId[] = ['crowbar', 'hold_key'];
