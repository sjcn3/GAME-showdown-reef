# 暗礁

锈湖式点击解谜 · 反走私题材 · 移动端 H5

> 「钱江杯」大学生反走私创作比赛作品

2026 年 8 月 8 日，澜沧港。一只报关为「五金件」的集装箱被吊上岸，
封条是新的 —— 而十年前的同一天，你父亲在这片码头殉职。

序章 → 三章 → 六个结局。三十分钟左右通关。

---

## 跑起来

```bash
npm install
npm run dev        # 开发服务器，改完存盘即生效
```

打开终端里给出的地址即可。手机连同一个局域网也能开（`vite.config.ts` 里开了 `host`）。

```bash
npm run build      # tsc --noEmit && vite build → dist/
npm run preview    # 预览 dist/
npm run typecheck  # 只跑类型检查
npm test           # 单元测试（vitest，125 条 / 5 个文件）
```

### 界面上几个开关

| 位置 | 是什么 |
|---|---|
| 标题页右上角 | 音效开关，记得住（写 localStorage） |
| 标题页左下角铜徽 | 制作信息面板 |
| 标题页第三格按钮 | 「判定表 · 调试面板」—— 由 `src/debugPanel.ts` 一个常量控制 |
| 主按钮下方（有存档时才出现） | 「重新开始」，**要点两下**才真的清进度 |

有存档时主按钮会变成**「继续调查」**，从上次落脚的那个场景接着走
（道具、flag、到过哪些地方都在）。

调试入口的开关在 [`src/debugPanel.ts`](src/debugPanel.ts)：把第一行的
`DEBUG_PANEL` 改成 `'closed'` 再重新构建，标题页不再出现这一格，
`DebugScene` 也一并从产物里抖掉（实测小 2.4 kB）。

## 怎么玩

- **点**场景里可疑的地方 —— 能点的会亮起来。
- **先点道具栏里的道具**选中它，再**点场景里的目标**，就是出示 / 使用。
- 点空白处 = 放下手里那件东西。
- 对话框点任意位置翻页；右上角 ☰ 回标题页（会自动存档，随时能接着走）。

## 回归测试

25 条路线、916 步，全部在真实浏览器里点出来：

```bash
node tools/regress.mjs --mobile      # 桌面 16 + 手机 8 + 横屏 1
node tools/regress.mjs --only p2     # 只跑一条
node tools/regress.mjs --help
```

路线定义在 `tools/steps/*.json`，截图落在 `shots/<路线名>/`。

`_` 开头的路线是按需跑的取证路线，不进矩阵：
`_motion`（动效到底有没有在动）· `_plates`（六张结局插画）· `_gallery`（图鉴两态）·
`_chapter`（三张章节卡）· `_textbox`（对话框长短两种行数）· `_icons`（道具图标接触印相）·
`_resume`（续玩端到端）· `_final`（收尾核查）· `_debug-open` / `_debug-closed`（调试面板开关两态）。

有一个例外：**`_stress.json` 作为 `bad-save` 挂进了矩阵** —— 它专门往
localStorage 里塞畸形存档（坏 JSON / 旧格式 / 版本不符 / `sceneId` 指向不存在的场景），
确认游戏退回「开始调查」而不是变成一个点了没反应的按钮。

**`shots/` 整个目录不进版本库** —— 雨、尘埃、灯光呼吸都有相位，
每跑一次就有一大半图变样；给人看的静态截图在 [`docs/截图/`](docs/截图/)。

回归依赖 `?dev=1` 提供的 `__anJiao` 调试接口（`src/dev.ts`）。

## 部署

线上走 **GitHub → Vercel**，仓库里该配的都配好了，Vercel 那边导入仓库直接 Deploy 即可：

- `vercel.json` —— 构建命令 `npm run build`、产物目录 `dist`、装依赖用 `npm ci`；
  并给 `/assets/*` 加了 `immutable` 长缓存（文件名带内容哈希，可以放心缓存一年），
  `index.html` 则每次回源。
- `package.json` 的 `engines.node` = `>=22.12.0`（vite 8 的下限）。
- `vite.config.ts` 的 `base: './'` —— 产物里全是相对路径，挂域名根目录或子路径都能跑。

部署前想先本地验一遍「干净克隆能不能构建」：

```bash
git clone <仓库地址> /tmp/x && cd /tmp/x && npm ci && npm run build
```

产物只有两个文件：`dist/index.html` + `dist/assets/index-<hash>.js`。

> ⚠️ 推 GitHub 之前留意：`.git` 现在有 54 MB —— 早期提交把 `node_modules`
> 和 `dist` 一起提交过（历史里最大的单个对象 47.7 MB）。国内推 GitHub 到这个量级
> 慢且容易断。瘦身命令见设计文档 §11.7。

## 目录

```
src/
  art/           程序化美术：场景、人物、道具图标、结局插画、动效层
  core/          状态机、存档、结局判定、音效合成
  data/          章节、道具、文档、结局表
  scenes/        Phaser 场景
  ui/            文本框、道具栏、证据列表、面板、章节卡……
  debugPanel.ts  调试入口的开关（见上）
tools/           回归与取证脚本（不参与打包）
tests/           vitest 单测
docs/            设计文档、剧本、人物概念图、静态截图
shots/           回归截图（不进库）
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
