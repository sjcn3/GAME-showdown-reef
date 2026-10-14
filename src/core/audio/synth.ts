/**
 * Web Audio 合成器 —— 八个 cue 的真实发声实现（设计文档 10.6）。
 *
 * 为什么是合成而不是素材：项目里一个音频文件都没有，也不打算为这件事加依赖。
 * 八个时点要的其实都是很短的提示音，用振荡器 + 噪声 + 包络完全做得出来，
 * 于是把「发声」和「素材」解耦：`SFX_FILES` 仍然是空清单，但游戏已经会响。
 * 将来 P5 补了真素材，这里一行都不用删 —— Sfx.ts 会优先走文件。
 *
 * 这个模块刻意不认识 Phaser：它只跟 Web Audio 打交道，
 * 于是「查表 / 记 history / 静音」这些属于游戏逻辑的事全留在 Sfx.ts 里，
 * 这里只负责「给我一个 cue，我把它变成一段声音」。
 *
 * Node 环境（`test.environment: 'node'`）里没有 window，也没有 AudioContext，
 * 所以每个入口都先问一句「这里能不能出声」，不能就安静地什么都不做。
 */

import type { SfxCue } from '../Sfx';

/** 总音量。取 0.25：手机小喇叭上听得见，戴耳机连点九次热点也不至于刺耳 */
const MASTER_GAIN = 0.25;

/**
 * 噪声缓冲只生成一次并缓存 —— 打开一个文档要 2 秒 × 48000 个随机数，
 * 每响一次现算一遍等于让主线程白等几十毫秒；而噪声是纯随机，
 * 复用它不会听出「同一段」。
 */
const NOISE_SECONDS = 2;

/** 把包络压到 0 需要一小段斜坡而不是直接跳变，否则扬声器会「啪」一声 */
const RELEASE = 0.02;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let gestureArmed = false;

/** 浏览器里 Android / 老 Safari 仍然只认带前缀的构造器，这里统一拿到那一个 */
function audioContextCtor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as Window & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** 能不能出声 —— test.environment 是 node，这里必须是 false */
export function synthSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return audioContextCtor() !== null;
}

/**
 * 惰性创建 AudioContext，并且只创建一次。
 *
 * 不在模块加载时就建：Chrome 在没有用户手势之前创建的上下文一律是 suspended，
 * 每建一个就往控制台丢一条警告，而烟测把控制台报错当失败信号 ——
 * 那样会莫名其妙一片红。真正需要它的是第一次 playSfx。
 */
function ensureSynth(): boolean {
  if (!synthSupported()) return false;
  if (!ctx) {
    try {
      const Ctor = audioContextCtor();
      if (!Ctor) return false;
      ctx = new Ctor({ latencyHint: 'interactive' });
      master = ctx.createGain();
      // 输出声道数跟随设备：单声道设备上强行 2 声道会让 iOS 的 WebAudio 静音
      master.channelCount = ctx.destination.channelCount;
      master.channelCountMode = 'explicit';
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
    } catch {
      // 浏览器明确拒绝（隐私模式 / 没有音频设备）时也不能抛，退化成 history-only
      ctx = null;
      master = null;
      return false;
    }
  }
  return master !== null;
}

/**
 * 自动播放策略：上下文必须等到一次用户手势之后才允许 resume。
 *
 * 挂一次就够，而且**只挂一次** —— 每次 playSfx 都挂监听会让点击越点越慢。
 * 手势里顺手播一个 1 采样的静音 buffer，是 iOS Safari 上公认的解锁手法。
 */
export function armOnGesture(): void {
  if (gestureArmed || typeof window === 'undefined') return;
  gestureArmed = true;
  window.addEventListener(
    'pointerdown',
    () => {
      if (!ensureSynth() || !ctx || !master) return;
      try {
        const unlock = ctx.createBufferSource();
        unlock.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
        unlock.connect(master);
        unlock.start();
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        /* 解锁失败只意味着这次可能没声音，不该影响游戏 */
      }
    },
    { once: true, passive: true },
  );
}

/** 发声结果：'blocked' = 浏览器还没松口（要先点一下屏幕），不是错误 */
export type SynthOutcome = 'played' | 'unavailable' | 'blocked';

/**
 * 生成一次性的噪声源。
 * 噪声不需要「音符」，但一定要被包络控制，否则会一直响到页面关闭。
 */
function buildNoise(ac: AudioContext): AudioBuffer {
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * NOISE_SECONDS), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noiseSource(): AudioBufferSourceNode | null {
  if (!ctx || !master) return null;
  if (!noise) noise = buildNoise(ctx);
  const src = ctx.createBufferSource();
  src.buffer = noise;
  // 循环播放，且每次从缓冲里随机切入 —— 噪声本身没有接缝，
  // 换一段纯粹的动机是：连点九次热点时，同一撮噪声反复出现会听出「复读机」感
  src.loop = true;
  return src;
}

/**
 * 一条「起音 → 衰减 → 归零」的包络曲线。
 *
 * 衰减用 setTargetAtTime（指数收敛）而不是 linearRamp：后者到点会急停，
 * 听感上像被切断；指数尾巴才像自然衰减。
 */
function shapeEnvelope(param: AudioParam, t0: number, peak: number, attack: number, decay: number, curve: number): void {
  param.cancelScheduledValues(t0);
  param.setValueAtTime(0, t0);
  param.linearRampToValueAtTime(peak, t0 + attack);
  param.setTargetAtTime(0, t0 + attack, decay / curve);
  // 兜底：有些实现不会把 setTargetAtTime 真的收到 0，留个硬着陆避免节点永远占着输出
  param.setValueAtTime(0, t0 + attack + decay * 4);
}

interface NoteOptions {
  at?: number;
  attack?: number;
  decay?: number;
  peak?: number;
  type?: OscillatorType;
  filter?: number;
  /** 终点频率，用来做滑音 */
  glideTo?: number;
  glideTime?: number;
  /** 颤音，闪回那种「水下」感靠它 */
  tremolo?: { rate: number; depth: number };
}

/**
 * 一个振荡器音符：振荡器 → 低通 → 包络 → 总线。
 * 低通用处有两个 —— 剪掉方波/锯齿的高次谐波（手机喇叭上会炸），
 * 以及给不同 cue 一个明确的音色区分（闷 vs 亮）。
 */
function note(freq: number, dur: number, opts: NoteOptions = {}): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  const peak = opts.peak ?? 0.2;
  const attack = opts.attack ?? 0.008;
  const decay = opts.decay ?? 0.09;
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.glideTo !== undefined) {
    const gt = Math.max(0.001, opts.glideTime ?? dur);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, opts.glideTo), t0 + gt);
  }

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(opts.filter ?? 2000, t0);
  // 低通只做减法，不抬高 Q —— 共振峰会让手机小喇叭上的短音听起来发「哨」
  filter.Q.value = 0.7;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  shapeEnvelope(gain.gain, t0, peak, attack, decay, 4);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  if (opts.tremolo) {
    // 颤音不能直接改 gain.gain：那条参数上已经排好了包络，再叠 LFO 会打架。
    // 所以另开一级 trem 增益，让包络和颤音分居前后。
    const trem = ctx.createGain();
    trem.gain.value = 1;
    gain.disconnect();
    gain.connect(trem);
    trem.connect(master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = opts.tremolo.rate;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = opts.tremolo.depth;
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);
    lfo.start(t0);
    lfo.stop(t0 + dur + RELEASE);
  }

  osc.start(t0);
  // 停得比包络尾巴略晚一点，保证是被静音之后才停，不会切出咔哒声
  osc.stop(t0 + dur + RELEASE);
}

interface NoiseOptions {
  at?: number;
  attack?: number;
  decay?: number;
  peak?: number;
  type?: BiquadFilterType;
  from: number;
  to?: number;
  q?: number;
}

/** 一撮被带通塑形的噪声：纸、布、撞击的质感都从这儿来 */
function noiseBurst(dur: number, opts: NoiseOptions): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + (opts.at ?? 0);
  const src = noiseSource();
  if (!src) return;

  const filter = ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.from, t0);
  if (opts.to !== undefined && opts.to !== opts.from) {
    // 扫频让噪声听起来在「移动」，静态白噪声只会像收音机雪花
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
  }
  filter.Q.value = opts.q ?? 1.1;

  const gain = ctx.createGain();
  gain.gain.value = 0;
  shapeEnvelope(gain.gain, t0, opts.peak ?? 0.16, opts.attack ?? 0.004, opts.decay ?? 0.06, 3);

  src.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  // 第二个参数是缓冲内的随机起点，见 noiseSource()
  src.start(t0, Math.random() * NOISE_SECONDS);
  src.stop(t0 + dur + RELEASE);
}

/** 点击热点：一记干脆的短促「嗒」，60ms 上下，带一点点木头质感 */
function cueHotspot(): void {
  noiseBurst(0.06, { from: 2600, q: 1.6, peak: 0.14, attack: 0.002, decay: 0.018 });
  // 一点点低频垫底，纯噪声会像电流声而不是「敲到了东西」
  note(320, 0.06, { type: 'triangle', attack: 0.002, decay: 0.02, peak: 0.1, filter: 1200 });
}

/** 常规线索：两个音上行，闷、纸感，像翻卡片看见一行字 */
function cueClue(): void {
  note(587.33, 0.34, { type: 'triangle', attack: 0.02, decay: 0.16, peak: 0.16, filter: 1800 });
  note(880, 0.5, {
    at: 0.14,
    type: 'triangle',
    attack: 0.02,
    decay: 0.22,
    peak: 0.15,
    filter: 2000,
  });
  noiseBurst(0.1, { from: 1400, to: 2600, q: 1.2, peak: 0.05, attack: 0.006, decay: 0.04 });
}

/** 关键道具：三个音琶音，比 clue 亮一档、长一档，最后一次点击要「有分量」 */
function cueKeyItem(): void {
  const notes = [523.25, 659.25, 1046.5];
  notes.forEach((freq, i) => {
    const last = i === notes.length - 1;
    note(freq, last ? 0.6 : 0.3, {
      at: i * 0.11,
      type: 'triangle',
      attack: 0.008,
      decay: last ? 0.3 : 0.12,
      peak: 0.15,
      // 越往上滤得越开，音色一路变亮，和 clue 的闷形成对比
      filter: 2400 + i * 900,
    });
  });
  noiseBurst(0.08, { from: 3000, to: 5200, q: 0.9, peak: 0.05, attack: 0.003, decay: 0.03 });
}

/** 闪回：低频下滑 + 颤音，潜水式的水下感；音高一路掉，暗示「回到过去」 */
function cueFlashback(): void {
  note(392, 1.8, {
    type: 'sine',
    attack: 0.12,
    decay: 0.9,
    peak: 0.22,
    filter: 900,
    glideTo: 98,
    glideTime: 1.7,
    tremolo: { rate: 5.5, depth: 0.56 },
  });
  // 上三度叠一层，微微走音，让下坠听起来是「不稳的」
  note(466.16, 1.6, {
    at: 0.06,
    type: 'sine',
    attack: 0.16,
    decay: 0.8,
    peak: 0.12,
    filter: 700,
    glideTo: 116.54,
    glideTime: 1.5,
    tremolo: { rate: 4.2, depth: 0.46 },
  });
  noiseBurst(0.9, { from: 900, to: 260, q: 0.7, peak: 0.05, attack: 0.05, decay: 0.35 });
}

/** 文档翻阅：两撮被带通扫过的噪声，像纸从指尖滑出去；第二撮更轻，是回弹 */
function cueDocument(): void {
  noiseBurst(0.32, { from: 700, to: 2600, q: 1.0, peak: 0.16, attack: 0.004, decay: 0.08 });
  noiseBurst(0.2, { at: 0.16, from: 1800, to: 900, q: 1.2, peak: 0.09, attack: 0.004, decay: 0.06 });
  // 短促的高频「沙」让纸边更脆，不然只有一片呼呼声
  noiseBurst(0.05, { from: 5200, q: 2.0, peak: 0.07, attack: 0.002, decay: 0.02 });
}

/** 「要不要再找找？」：第二个音往上挑，是问句语调；落在四度上，故意不回主音 */
function cueSearchAgain(): void {
  note(440, 0.32, { type: 'sine', attack: 0.012, decay: 0.14, peak: 0.16, filter: 1500 });
  note(587.33, 0.62, {
    at: 0.19,
    type: 'sine',
    attack: 0.02,
    decay: 0.3,
    peak: 0.17,
    filter: 1800,
    // 尾巴再往上抬一点：疑问语气就靠这一下
    glideTo: 622.25,
    glideTime: 0.35,
  });
}

/** 对峙回合：低频鼓点，短而闷；两秒的紧张感压在 450ms 里 */
function cueConfront(): void {
  // 频率从 110 掉到 46：下坠越快，越像「心口一沉」
  note(110, 0.42, {
    type: 'sine',
    attack: 0.004,
    decay: 0.18,
    peak: 0.3,
    filter: 500,
    glideTo: 46,
    glideTime: 0.3,
  });
  noiseBurst(0.1, { from: 420, q: 0.8, peak: 0.14, attack: 0.002, decay: 0.04 });
  // 55Hz 留一根长一点的余音，是「还没结束」的那点不安
  note(55, 0.55, { type: 'sine', attack: 0.01, decay: 0.3, peak: 0.16, filter: 300 });
}

/** 结局：A 小调和弦长音，慢慢亮起来再慢慢退下去；音符错开 60ms 进入，像潮水漫上来 */
function cueEnding(): void {
  const chord = [220, 261.63, 329.63]; // A3 C4 E4
  chord.forEach((freq, i) => {
    note(freq, 3.4, {
      at: i * 0.06,
      type: 'sine',
      attack: 0.55,
      decay: 1.3,
      peak: 0.13,
      filter: 2600,
    });
    // 每个音再叠一层微失谐的副本，两把「乐器」才有合唱式的厚度
    note(freq * 1.004, 3.2, {
      at: i * 0.06 + 0.03,
      type: 'sine',
      attack: 0.7,
      decay: 1.2,
      peak: 0.08,
      filter: 2200,
    });
  });
  // 根音下八度，给和弦一个底
  note(110, 3.6, { type: 'sine', attack: 0.8, decay: 1.5, peak: 0.12, filter: 900 });
}

const CUES: Record<SfxCue, () => void> = {
  hotspot: cueHotspot,
  clue: cueClue,
  keyItem: cueKeyItem,
  flashback: cueFlashback,
  document: cueDocument,
  searchAgain: cueSearchAgain,
  confront: cueConfront,
  ending: cueEnding,
};

/**
 * 按 cue 发声。
 *
 * 返回值是给排查用的：'blocked' 表示浏览器还没松口（要先点一下屏幕），
 * 这不是错误，所以调用方不该把它当异常处理，更不该弹提示。
 */
export function playSynthCue(cue: SfxCue): SynthOutcome {
  if (!ensureSynth() || !ctx || !master) return 'unavailable';
  if (ctx.state === 'suspended') {
    // 顺手试一次 resume：手势之后浏览器会照做，手势之前它只是继续 suspend，不抛错
    void ctx.resume();
    if (ctx.state === 'suspended') return 'blocked';
  }
  try {
    CUES[cue]();
  } catch {
    // 单个 cue 合成失败（极端情况下节点数量被限制）不该让整个游戏崩
    return 'unavailable';
  }
  return 'played';
}
