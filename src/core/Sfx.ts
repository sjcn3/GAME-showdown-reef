/**
 * 音效接口（设计文档 10.6）
 *
 * 八个时点现在真的会响 —— 但**一个音频文件都没有**：
 * 声音由 `core/audio/synth.ts` 用 Web Audio 现场合成（振荡器 + 噪声 + 包络）。
 * 于是 P5 有两条路可以走，不用改任何调用点：
 *   1. 什么都不做 —— 合成音一直用下去；
 *   2. 把文件放进 public/、在 SFX_FILES 里登记 —— 一旦加载成功就自动改用素材。
 *
 * 这一点为什么重要：`playSfx()` 的 history 是烟测的断言对象，
 * 它记录的是「该响的地方有没有被调用」，跟「这次有没有真出声」必须解耦。
 * 所以在 Node（没有 AudioContext）、静音、自动播放策略拦截这几种情况下，
 * 调用照记、函数照常返回，绝不抛。
 *
 * 为什么不直接 `this.sound.play('hotspot')`：
 * 缺文件时 Phaser 会静默失败（甚至 404），而"没声音"和"调错了地方"
 * 从外面看完全一样。记 history 之后，烟测脚本能直接断言
 * 「拿到铜徽时确实响了 key 和 flashback」，不必靠耳朵。
 */

import type Phaser from 'phaser';

import { armOnGesture, playSynthCue } from './audio/synth';

/** 设计文档 10.6 列的八个时点 */
export type SfxCue =
  | 'hotspot' // 点击热点
  | 'clue' // 获得常规线索
  | 'keyItem' // 获得关键道具
  | 'flashback' // 闪回
  | 'document' // 文档翻阅
  | 'searchAgain' // 「要不要再找找？」
  | 'confront' // 对峙回合开始
  | 'ending'; // 结局

export const SFX_CUES: readonly SfxCue[] = [
  'hotspot',
  'clue',
  'keyItem',
  'flashback',
  'document',
  'searchAgain',
  'confront',
  'ending',
];

/** 合成音的基准音量，和 synth.ts 里的总线增益保持一致，免得素材一进来响一大截 */
const SAMPLE_GAIN = 0.25;

/**
 * 素材清单 —— **P5 只需要往这里加条目**。
 * 键是 cue，值是相对 public/ 的路径。
 *
 * 留空是故意的，但现在含义变了：以前空着等于「没声音」，
 * 现在空着等于「用合成音」。所以这里一旦登记，就必须真的有文件 ——
 * 登记了却加载失败，Phaser 会去请求一个 404，而烟测把 failedRequests
 * 当失败信号，届时会一片红。
 */
export const SFX_FILES: Partial<Record<SfxCue, string>> = {};

const MUTE_KEY = 'an-jiao:sfx-muted';
const HISTORY_LIMIT = 40;

let muted = readMuted();
const history: SfxCue[] = [];

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false; // 隐私模式下 localStorage 会抛，静音与否不该让游戏崩
  }
}

/**
 * 预加载已登记的素材。清单为空时这一步不产生任何请求 ——
 * 合成音不需要加载，所以 P0~P5 都不必为缺素材担心 404。
 *
 * 顺便在这里挂上「首次用户手势解锁音频」的监听：本函数是唯一
 * 在游戏开局必定被调用一次（BootScene.preload）的入口，
 * 比在模块顶层挂监听更可控，也保证只会挂一次。
 */
export function preloadSfx(scene: Phaser.Scene): void {
  armOnGesture();
  for (const [cue, path] of Object.entries(SFX_FILES)) {
    if (path) scene.load.audio(cue, path);
  }
}

/**
 * 播放一个音效。
 *
 * 四种情况都算正常，且都不会抛：
 *   1. 没登记素材 → 走合成音
 *   2. 登记了但没加载成功 → 留一条 console.warn，退回合成音（比一片死寂有用）
 *   3. 静音中 → 静默返回
 *   4. Node / 浏览器不给用音频 → 合成器自己安静地放弃
 * 无论哪种，**都会记进 history** —— 断言的是"调对了地方"，不是"出了声"。
 */
export function playSfx(scene: Phaser.Scene, cue: SfxCue): void {
  history.push(cue);
  if (history.length > HISTORY_LIMIT) history.shift();

  if (muted) return;

  const path = SFX_FILES[cue];
  if (!path) {
    // 没登记素材是常态：交给合成器，它会在没有 Web Audio 的环境里自己返回
    playSynthCue(cue);
    return;
  }

  if (!scene.cache.audio.exists(cue)) {
    console.warn(`[sfx] 登记了 ${cue} → ${path}，但音频没加载成功`);
  } else {
    // 素材优先：P5 补了真声音之后，合成音自然退居后备
    scene.sound.play(cue, { volume: SAMPLE_GAIN });
    return;
  }

  playSynthCue(cue);
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    /* 存不下就只影响这一次会话 */
  }
}

/** 开发钩子用：最近响过哪些 cue（新的在后） */
export function sfxHistory(): readonly SfxCue[] {
  return [...history];
}

/** 开发钩子用：清空记录，好让每一段断言只看自己那几步 */
export function clearSfxHistory(): void {
  history.length = 0;
}
