/**
 * 文档内页原文（设计文档 9.2 / 剧本 §文档内页原文）
 *
 * 渲染约定：
 *  - `print` 系统宋体，正常字色
 *  - `hand`  手写体。正式美术阶段换成一张手绘图片（art 字段），
 *            天然强化「只有这一条不一样」的视觉冲击，且省掉数 MB 中文字体
 *  - `note`  玩家视角的旁注（原剧本里 〔〕 内的观察），字色更暗、缩进
 */

import type { DocId } from '../core/Story';
import type { ItemId } from './items';

export type DocLineStyle = 'print' | 'hand' | 'note';

export interface DocLine {
  readonly text: string;
  readonly style?: DocLineStyle;
}

export interface DocDef {
  readonly id: DocId;
  readonly title: string;
  readonly lines: readonly DocLine[];
  /** 该条手写内容正式美术化后的图片键（P5 接入） */
  readonly handArt?: string;
}

export const DOCS: Readonly<Record<DocId, DocDef>> = {
  // ── 1 · 第二章 · 保险柜线索 ──────────────────
  ship_log: {
    id: 'ship_log',
    title: '昌隆号 · 航海日志',
    lines: [
      { text: '2026.07.12　　沧澜港 → 外锚地　　已报备' },
      { text: '2026.07.19　　沧澜港 → 锚地以东　　未报备' },
      { text: '2026.07.26　　沧澜港 → 外锚地　　已报备' },
      { text: '2026.08.02　　沧澜港 → 锚地以东　　未报备' },
      { text: '' },
      // 全篇**只有这一条**是手写 —— 密码 0808 的谜面就架在这上面：
      // 多一条 hand，玩家就有两个日期可选，谜题立刻不可解。
      // tests/story.test.ts:216 盯着这条。
      { text: '2026.08.08　　沧澜港 → 锚地以东 7 海里　　未报备', style: 'hand' },
      { text: '（前几条是打印的。最后这条的墨迹和打印的不一样，是后来才补上去的。）', style: 'note' },
    ],
  },

  // ── 2 · 第一章 · 木箱堆 ──────────────────────
  manifest: {
    id: 'manifest',
    title: '沧澜港海关 · 进境货物提货单',
    lines: [
      { text: '提单号：CL-2026-0731-117' },
      { text: '货　名：木制工艺品（申报）' },
      { text: '件　数：1 × 40HQ' },
      { text: '收货人：昌隆渔业有限公司' },
      { text: '' },
      { text: '「木制工艺品」四个字有明显涂改痕迹，', style: 'note' },
      { text: '底下的原字依稀可辨：象牙雕刻品。', style: 'note' },
      { text: '' },
      { text: '落款处有一枚模糊的圆形暗记——蛇形盘绕。', style: 'note' },
    ],
  },

  // ── 3 · 第二章 · 保险柜 ──────────────────────
  list_fragment: {
    id: 'list_fragment',
    title: '内部联络 · 名单',
    lines: [
      { text: '分管副局长　　代号：信天翁' },
      { text: '　收受金额：￥1,200,000' },
      { text: '　事　　由：放行 昌隆号　3 航次' },
      { text: '' },
      { text: '（以下页面被撕去）' },
      { text: '撕口正好截在「信天翁」这一行之后。', style: 'note' },
      { text: '我拿到的，永远只是半张。', style: 'note' },
    ],
  },

  // ── 4 · 第二章 · 警号牌背面 ──────────────────
  badge_back: {
    id: 'badge_back',
    title: '半块警号牌 · 背面',
    lines: [
      { text: '海　缉　　0 4 0 8 0 8' },
      { text: '─────────────────' },
      { text: '　　　　　　〔背面〕' },
      { text: '' },
      { text: '一个简笔的、展翅的鸟形刻痕——信天翁。', style: 'note' },
      { text: '刻痕很新。是近几年才刻上去的。', style: 'note' },
      { text: '有人把这块牌子，当战利品收着。', style: 'note' },
    ],
  },

  // ── 5 · 第二章 · 书架旧书（密码提示）──────────
  old_book: {
    id: 'old_book',
    title: '旧书页',
    lines: [
      { text: '（书页空白处，有人用铅笔写了一行小字）' },
      { text: '' },
      { text: '　　　　航海日的后四位。', style: 'hand' },
      { text: '' },
      { text: '字迹很轻，像是怕被人看见。', style: 'note' },
    ],
  },
};

/**
 * 道具 → 它对应的可重读原件（证据列表用）。
 *
 * 只有真正"从纸上拿到的"那几件才有第二页可看：提货单、航海日志、
 * 名单残页、警号牌背面。撬棍、烟蒂、切割痕迹本身就是一件东西，
 * 读过一次也就读完了 —— 把它们也塞进这张表，玩家点开只会看到一段
 * 和道具栏里一模一样的话，白跑一趟。
 *
 * `old_book` 不在这里：那是书架上的提示，不是玩家的物证。
 */
export const DOC_FOR_ITEM: Partial<Record<ItemId, DocId>> = {
  altered_manifest: 'manifest',
  ship_log: 'ship_log',
  list_fragment: 'list_fragment',
  badge_half: 'badge_back',
};
