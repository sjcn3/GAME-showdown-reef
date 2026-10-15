# 暗礁

锈湖式点击解谜 · 反走私题材 · 移动端 H5

> 「钱江杯」大学生反走私创作比赛作品

2026 年 8 月 8 日，澜沧港。一只报关为「五金件」的集装箱被吊上岸，
封条是新的 —— 而十年前的同一天，你父亲在这片码头殉职。

序章 → 三章 → 六个结局。三十分钟左右通关。

---

## 如何游玩？

```bash
npm install
npm run dev        # 开发服务器，改完存盘即生效
```

打开终端里给出的地址即可。手机连同一个局域网也能开（`vite.config.ts` 里开了 `host`）。

```bash
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # 预览 dist/
npm run typecheck  # 只跑类型检查
npm test           # 单元测试（vitest）
```

## 回归测试

24 条路线、858 步，全部在真实浏览器里点出来：

```bash
node tools/regress.mjs --mobile      # 桌面 + 手机 + 横屏全跑一遍
node tools/regress.mjs --only p2     # 只跑一条
node tools/regress.mjs --help
```

路线定义在 `tools/steps/*.json`，截图落在 `shots/<路线名>/`。
`_` 开头的路线（`_motion` / `_plates` / `_gallery` / `_chapter` / `_debug-open` …）
是按需跑的取证路线。**`shots/` 整个目录不进版本库** —— 雨、尘埃、灯光呼吸都有相位，
每跑一次就有一大半图变样；给人看的静态截图在 [`docs/截图/`](docs/截图/)。

回归依赖 `?dev=1` 提供的 `__anJiao` 调试接口（`src/dev.ts`）。

## 目录

```
src/
  art/        程序化美术：场景、人物、道具图标、结局插画、动效层
  core/       状态机、存档、结局判定、音效合成
  data/       章节、道具、文档、结局表
  scenes/     Phaser 场景
  ui/         文本框、道具栏、证据列表、面板、章节卡……
tools/        回归与取证脚本（不参与打包）
docs/         设计文档与剧本
shots/        回归截图
```

## 素材与 AI 使用

**运行期零外部素材**：美术全部是 Phaser `Graphics` 程序化绘制，
音效全部是 Web Audio 实时合成，字体用系统字体栈，运行期依赖只有 Phaser 一个。
详见设计文档 §10.8（含一条核查命令）。

本游戏由 AI 辅助制作，署名见标题页左下角铜徽。

## 文档

- [`docs/杂项/01-设计文档.md`](docs/杂项/01-设计文档.md) —— 唯一的设计真值来源
- [`docs/杂项/02-剧本全文.md`](docs/杂项/02-剧本全文.md) —— 剧本
- [`docs/人物设计图/`](docs/人物设计图/) —— 三张人物概念图（画立绘时的参考，不进产物）
- [`docs/截图/`](docs/截图/) —— 九张静态截图，不用跑项目也能看成品
