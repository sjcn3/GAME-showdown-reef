/**
 * 章节元数据 + 探索场景数据（设计文档 5 / 6 / 11.2）
 *
 * 这个文件是「剧本 → 可玩数据」的**唯一翻译层**：
 * 每个热点分支对应 02-剧本全文.md 里的一条 〔条件〕，
 * 改剧情只改这里，引擎（scenes/ExploreScene.ts）不用动。
 *
 * 热点命中区与 art/placeholders.ts 的图形坐标成对设计，按 H 键可叠加显示核对。
 */

import { COLORS } from '../config';
import type { ItemId } from './items';
import type { Effect, SceneDef } from '../core/Story';
import type { GameState } from '../core/GameState';

// ── 章节元数据 ────────────────────────────────────────────

export interface ChapterMeta {
  readonly title: string;
  readonly time: string;
  readonly hint: string;
  /** 主色（黄昏 / 深夜 / 雨夜） */
  readonly tint: number;
}

export const CHAPTERS: readonly ChapterMeta[] = [
  {
    title: '第一章 · 异常集装箱',
    time: '2026 年 8 月 8 日 · 黄昏',
    hint: '码头集装箱区。封条是新的。',
    tint: COLORS.dusk,
  },
  {
    title: '第二章 · 昌隆号',
    time: '同日 · 深夜',
    hint: '锚地油轮。船长室、走廊、底舱。',
    tint: COLORS.night,
  },
  {
    title: '第三章 · 交易夜',
    time: '同日 · 雨夜',
    hint: '废弃仓库。三个回合，决定你能收多紧。',
    tint: COLORS.rain,
  },
];

/** 每章的第一个探索场景（进入章节 / 章节卡结束后去哪） */
export const CHAPTER_FIRST_SCENE: Readonly<Record<number, string>> = {
  0: 'dock_exterior',
  1: 'captain_cabin',
  2: 'warehouse_approach',
};

/** 序 · 开场（黑屏，潮水声）——在标题画面前播一次 */
export const PROLOGUE_LINES: readonly string[] = [
  '十年前的同一天，我父亲在这片码头殉职。',
  '今天是我接替他的第一天。',
];

// ── 收集完整度 ────────────────────────────────────────────

/**
 * 每一章「可以拿走的东西」清单。
 *
 * 这里是手写常量而不是从 SCENES 扫出来，是因为关卡数据需要反向依赖它
 * （「要不要再找找？」的判定要在热点谓词里用）；两者的一致性由
 * tests/story.test.ts 的 collectiblesOf 断言守住。
 */
export const CHAPTER_ITEMS: Readonly<Record<number, readonly ItemId[]>> = {
  // 第一章：封条 + 撬棍 + 薄荷烟蒂 + 涂改提货单 + 夹层切割痕迹 + 蛇形铜徽 + 象牙样本
  0: [
    'customs_seal',
    'crowbar',
    'mint_cigarette',
    'altered_manifest',
    'cut_mark',
    'bronze_emblem',
    'ivory_sample',
  ],
  1: [
    // 第二章：航海日志 + 半块警号牌 + 保护伞名单残页 + 底舱钥匙
    'ship_log',
    'badge_half',
    'list_fragment',
    'hold_key',
  ],
  2: [],
};

/** 某一章是否已全部收集 */
export function chapterDone(chapter: number, state: GameState): boolean {
  return (CHAPTER_ITEMS[chapter] ?? []).every((id) => state.has(id));
}

// ── 第一章 · 场景 1 · 黄昏码头（集装箱外景）──────────────

const DOCK_ENTER: readonly Effect[] = [
  {
    t: 'say',
    lines: ['集装箱是三天前从昌隆号上卸下来的，报关单上写着“木制工艺品”。', '封条是新的。'],
  },
];

const C1_CLEAR: readonly string[] = [
  '箱子是昌隆号上卸的。船现在停在锚地，没靠岸。',
  '……你要是上去了，别说是我讲的。',
];

const dockExterior: SceneDef = {
  id: 'dock_exterior',
  chapter: 0,
  title: '黄昏码头',
  paintKey: 'dock_exterior',
  onEnter: DOCK_ENTER,
  hotspots: [
    {
      id: 'seal',
      label: '集装箱门锁',
      rect: [378, 378, 118, 72],
      branches: [
        {
          when: (c) => !c.state.has('customs_seal'),
          effects: [
            {
              t: 'say',
              lines: ['封条完好——但胶痕是重新压过的。', '有人开过箱，又原样贴了回去。'],
            },
            { t: 'give', item: 'customs_seal' },
          ],
        },
        { effects: [{ t: 'say', lines: ['封条已经撕下来了。箱门还是锁着。'] }] },
      ],
    },
    {
      id: 'puddle',
      label: '左侧积水',
      rect: [40, 870, 252, 150],
      branches: [
        {
          when: (c) => !c.state.has('crowbar'),
          effects: [
            { t: 'say', lines: ['一根撬棍斜插在水里，柄上缠着褪色的胶带。'] },
            { t: 'give', item: 'crowbar' },
          ],
        },
        { effects: [{ t: 'say', lines: ['水很凉，底下只有砂石。'] }] },
      ],
    },
    {
      id: 'cigarette',
      label: '老周脚边的烟蒂',
      rect: [620, 984, 68, 30],
      branches: [
        {
          when: (c) => !c.state.has('mint_cigarette'),
          effects: [
            {
              t: 'say',
              lines: [
                '半支烟，烟嘴上有一个很小的绿色滤嘴标记。',
                '这是码头管理层才拿得到的特供薄荷烟。',
                '……老周脚边，为什么会有这个？',
              ],
            },
            { t: 'give', item: 'mint_cigarette' },
          ],
        },
        { effects: [{ t: 'say', lines: ['一支被踩灭的烟。'] }] },
      ],
    },
    {
      id: 'vent',
      label: '通风口',
      rect: [161, 636, 100, 70],
      branches: [
        {
          when: (c) => !c.state.hasFlag('vent_opened'),
          needs: 'crowbar',
          effects: [
            { t: 'say', lines: ['撬棍卡进缝隙，锈屑落了一地。栅栏开了。'] },
            { t: 'flag', flag: 'vent_opened' },
            { t: 'goto', scene: 'container_interior' },
          ],
        },
        {
          when: (c) => c.state.hasFlag('vent_opened'),
          effects: [{ t: 'goto', scene: 'container_interior' }],
        },
        { effects: [{ t: 'say', lines: ['通风口的栅栏锈死了，徒手掰不动。'] }] },
      ],
    },
    {
      id: 'zhou',
      label: '仓库管理员老周',
      rect: [572, 772, 148, 236],
      branches: [
        {
          when: (c) => !c.state.hasFlag('zhou_talked'),
          effects: [
            {
              t: 'say',
              who: '老周',
              lines: [
                '林警官……你爸当年，也是这么站在这个位置。',
                '我耳朵背，别的事我都不晓得。就晓得一件事——夜里常有油轮不靠岸，在锚地飘着。',
                '飘一夜，第二天箱子就多了。',
              ],
            },
            { t: 'flag', flag: 'zhou_talked' },
          ],
        },
        {
          effects: [
            {
              t: 'advanceChapter',
              from: 0,
              to: 1,
              who: '老周',
              lines: C1_CLEAR,
              hint: '要不要再找找？',
            },
          ],
        },
      ],
    },
  ],
};

// ── 第一章 · 场景 2 · 集装箱内部 ─────────────────────────

const containerInterior: SceneDef = {
  id: 'container_interior',
  chapter: 0,
  title: '集装箱内部',
  paintKey: 'container_interior',
  onEnter: [{ t: 'say', lines: ['箱子里有一股很淡的、医院才有的消毒水味。'] }],
  hotspots: [
    {
      // 放在「内壁壁板」前面：没发现切割痕迹时条件不成立，
      // 引擎会自动落到下一个热点（= 玩家点到的是壁板），与剧本一致。
      id: 'cache',
      label: '夹层暗格',
      rect: [592, 590, 44, 196],
      branches: [
        {
          when: (c) => c.state.hasFlag('cut_mark_found') && !c.state.hasFlag('cache_opened'),
          effects: [
            {
              t: 'say',
              lines: [
                '夹层最深处还有一道缝，歪歪斜斜的，像是硬抠出来的。',
                '手指伸不进去。',
              ],
            },
          ],
        },
        {
          when: (c) => c.state.hasFlag('cut_mark_found') && !c.state.hasFlag('cache_opened'),
          needs: 'crowbar',
          effects: [
            {
              t: 'say',
              lines: [
                '这道缝和专业切割完全不一样——边缘毛糙，是指甲一点一点抠出来的。',
                '十年了，没人发现这里。',
              ],
            },
            { t: 'give', item: 'bronze_emblem' },
            { t: 'give', item: 'ivory_sample' },
            { t: 'flag', flag: 'cache_opened' },
            {
              t: 'flashback',
              lines: ['一只手握着一枚蛇形铜徽。手的尺码比我的大。', '手背上有一道旧疤。'],
            },
            { t: 'say', who: '林深', lines: ['……爸？'] },
          ],
        },
        {
          when: (c) => c.state.hasFlag('cache_opened'),
          effects: [{ t: 'say', lines: ['缝里空了。'] }],
        },
      ],
    },
    {
      id: 'wall',
      label: '内壁壁板',
      rect: [540, 246, 166, 568],
      branches: [
        {
          when: (c) => !c.state.hasFlag('cut_mark_found'),
          effects: [
            {
              t: 'say',
              lines: [
                '钢板上有一道接缝，边缘整齐得不像原厂工艺。',
                '有人用专业工具切过，做出了一个夹层。',
              ],
            },
            { t: 'give', item: 'cut_mark' },
            { t: 'flag', flag: 'cut_mark_found' },
          ],
        },
        { effects: [{ t: 'say', lines: ['接缝边缘很整齐。是专业工具切的。'] }] },
      ],
    },
    {
      id: 'crates',
      label: '木箱堆',
      rect: [200, 556, 320, 344],
      branches: [
        {
          when: (c) => !c.state.hasFlag('crates_opened'),
          needs: 'crowbar',
          effects: [
            { t: 'say', lines: ['箱板裂开——不是“木制工艺品”。', '大量的碎象牙，断面还很新。'] },
            { t: 'flag', flag: 'crates_opened' },
            { t: 'give', item: 'altered_manifest' },
            { t: 'openDoc', doc: 'manifest' },
          ],
        },
        {
          when: (c) => !c.state.hasFlag('crates_opened'),
          effects: [{ t: 'say', lines: ['箱板钉得很死。'] }],
        },
        { effects: [{ t: 'say', lines: ['碎象牙从裂缝里漏出来。'] }] },
      ],
    },
    {
      id: 'back_out',
      label: '通风口（回去）',
      rect: [34, 62, 162, 142],
      branches: [{ effects: [{ t: 'goto', scene: 'dock_exterior' }] }],
    },
  ],
};

// ── 第二章 · 场景 3 · 船长室 ──────────────────────────────

/** 闪回 2（剧本 02 第 198–210 行）：父亲倒下、半块警号牌滑进排水沟 */
const FLASHBACK_2: readonly string[] = [
  '一个穿制服的人倒在水泥地上，手边是一块摔成两半的金属牌。',
  '半块滑进了排水沟。',
  '画面外，一双皮鞋的声音由远及近。',
  '然后停住了。',
];

const CABIN_ENTER: readonly Effect[] = [
  {
    t: 'say',
    lines: ['船上没有人。灯还亮着，茶是温的。', '像是刚走。'],
  },
];

const captainCabin: SceneDef = {
  id: 'captain_cabin',
  chapter: 1,
  title: '船长室',
  paintKey: 'captain_cabin',
  onEnter: CABIN_ENTER,
  hotspots: [
    {
      id: 'drawer',
      label: '办公桌抽屉',
      rect: [280, 830, 270, 120],
      branches: [
        {
          when: (c) => !c.state.hasFlag('drawer_opened'),
          effects: [
            { t: 'give', item: 'ship_log' },
            { t: 'flag', flag: 'drawer_opened' },
            { t: 'say', lines: ['打印体的记录都很规矩。', '只有最后一条，是手写的。'] },
            { t: 'openDoc', doc: 'ship_log' },
          ],
        },
        // 已经翻过：允许反复查看，玩家要靠日志上的日期推密码
        {
          effects: [
            { t: 'say', lines: ['抽屉里只剩一叠空白表格。'] },
            { t: 'openDoc', doc: 'ship_log' },
          ],
        },
      ],
    },
    {
      id: 'shelf',
      label: '书架层板',
      rect: [40, 300, 175, 300],
      branches: [
        {
          when: (c) => !c.state.hasFlag('book_read'),
          effects: [
            { t: 'say', lines: ['一本没有书名的旧书，书脊上压着一个蛇形标记。'] },
            { t: 'flag', flag: 'book_read' },
            { t: 'flag', flag: 'password_hint_read' },
            { t: 'openDoc', doc: 'old_book' },
            { t: 'say', lines: ['铅笔小字，写得很轻：', '「航海日的后四位。」'] },
          ],
        },
        { effects: [{ t: 'openDoc', doc: 'old_book' }] },
      ],
    },
    {
      id: 'safe',
      label: '保险柜',
      rect: [40, 700, 175, 230],
      branches: [
        {
          when: (c) => c.state.hasFlag('safe_opened'),
          effects: [{ t: 'say', lines: ['柜门敞着。里面已经空了。'] }],
        },
        {
          effects: [
            {
              t: 'password',
              title: '保险柜',
              answer: '0808',
              wrongText: '转盘弹回原位。',
              success: [
                { t: 'say', lines: ['锁芯“咔”地退开。'] },
                { t: 'give', item: 'badge_half' },
                { t: 'give', item: 'list_fragment' },
                { t: 'flag', flag: 'safe_opened' },
                { t: 'flashback', lines: FLASHBACK_2 },
                { t: 'say', who: '林深', lines: ['……另一半，是谁拿走的？'] },
                { t: 'openDoc', doc: 'badge_back' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'door_out',
      label: '右侧舱门（去走廊）',
      rect: [595, 330, 105, 470],
      branches: [{ effects: [{ t: 'goto', scene: 'corridor' }] }],
    },
  ],
};

// ── 第二章 · 场景 4 · 走廊 ────────────────────────────────

const corridor: SceneDef = {
  id: 'corridor',
  chapter: 1,
  title: '走廊',
  paintKey: 'corridor',
  onEnter: [{ t: 'say', lines: ['船内走廊很窄，灯是昏的。地上一层薄薄的积水。'] }],
  hotspots: [
    {
      id: 'back_cabin',
      label: '左侧舱门（回船长室）',
      rect: [40, 400, 120, 500],
      branches: [{ effects: [{ t: 'goto', scene: 'captain_cabin' }] }],
    },
    {
      id: 'bilge_door',
      label: '底舱门锁',
      rect: [250, 420, 220, 420],
      branches: [
        {
          when: (c) => !c.state.has('hold_key'),
          effects: [{ t: 'say', lines: ['挂锁很旧，但锁孔是干净的——最近常开。'] }],
        },
        // 有钥匙也先拦一下：保险柜没开就下去，会带着残缺的证据链进第三章
        {
          effects: [
            {
              t: 'searchAgain',
              chapter: 1,
              then: [
                { t: 'say', lines: ['钥匙插进去，锁开了。'] },
                { t: 'goto', scene: 'bilge' },
              ],
            },
          ],
        },
      ],
    },
    {
      id: 'hydrant',
      label: '消防栓玻璃',
      rect: [520, 420, 150, 190],
      branches: [
        {
          when: (c) => !c.state.hasFlag('glass_broken'),
          effects: [
            { t: 'say', lines: ['玻璃后面没有水带，只有一把钥匙。', '砸碎玻璃，碎片落进积水里。'] },
            { t: 'flag', flag: 'glass_broken' },
            { t: 'give', item: 'hold_key' },
          ],
        },
        { effects: [{ t: 'say', lines: ['玻璃已经碎了。箱子里面是空的。'] }] },
      ],
    },
  ],
};

// ── 第二章 · 场景 5 · 底舱 ────────────────────────────────

const bilge: SceneDef = {
  id: 'bilge',
  chapter: 1,
  title: '底舱',
  paintKey: 'bilge',
  onEnter: [
    { t: 'say', lines: ['穿山甲鳞片。', '按片计价，一公斤能顶我半年工资。'] },
    { t: 'say', who: '林深', lines: ['这不是一条船的事。'] },
  ],
  hotspots: [
    {
      id: 'back_up',
      label: '爬梯（回走廊）',
      rect: [52, 118, 132, 300],
      branches: [{ effects: [{ t: 'goto', scene: 'corridor' }] }],
    },
    {
      id: 'sacks',
      label: '麻袋堆',
      rect: [180, 480, 380, 380],
      branches: [
        {
          effects: [
            {
              t: 'advanceChapter',
              from: 1,
              to: 2,
              who: '林深',
              lines: ['先把这批货的样子记下来。'],
            },
          ],
        },
      ],
    },
  ],
};

// ── 第三章 · 交易夜 ───────────────────────────────────────

const APPROACH_ENTER: readonly Effect[] = [
  { t: 'say', lines: ['我把车停在仓库外三百米。', '雨很大，正好。'] },
];

/** 仓库外（车内）。开场二选一：先叫支援，还是直接推门进去。 */
const warehouseApproach: SceneDef = {
  id: 'warehouse_approach',
  chapter: 2,
  title: '仓库外 · 车内',
  paintKey: 'warehouse_approach',
  onEnter: APPROACH_ENTER,
  hotspots: [
    {
      id: 'radio',
      label: '对讲机',
      rect: [270, 916, 180, 168],
      branches: [
        {
          when: (c) => !c.state.hasFlag('requested_backup'),
          effects: [
            {
              t: 'say',
              who: '林深',
              lines: ['沧澜港缉私，请求支援。坐标我发过去了。'],
            },
            { t: 'flag', flag: 'requested_backup' },
            { t: 'toast', text: '支援已在路上' },
          ],
        },
        {
          effects: [{ t: 'say', lines: ['那边回话了：二十分钟到。'] }],
        },
      ],
    },
    {
      id: 'door',
      label: '仓库门',
      rect: [300, 420, 200, 165],
      branches: [{ effects: [{ t: 'goto', scene: 'warehouse_night' }] }],
    },
  ],
};

/** 仓库内。没有可翻的东西 —— 进来就是对峙。 */
const warehouseNight: SceneDef = {
  id: 'warehouse_night',
  chapter: 2,
  title: '雨夜仓库',
  paintKey: 'warehouse_night',
  onEnter: [
    { t: 'say', lines: ['门没锁。', '里面没开灯，只有两道影子。'] },
    { t: 'confrontation' },
  ],
  hotspots: [],
};

// ── 注册表 ────────────────────────────────────────────────

export const SCENES: Readonly<Record<string, SceneDef>> = {
  dock_exterior: dockExterior,
  container_interior: containerInterior,
  captain_cabin: captainCabin,
  corridor,
  bilge,
  warehouse_approach: warehouseApproach,
  warehouse_night: warehouseNight,
};

/** 按章节取场景（给调试面板 / 单测用） */
export function scenesOfChapter(chapter: number): SceneDef[] {
  return Object.values(SCENES).filter((s) => s.chapter === chapter);
}
