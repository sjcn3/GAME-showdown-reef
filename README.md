# 暗礁

锈湖式点击解谜 · 反走私题材 · 移动端 H5

> 「钱江杯」大学生反走私创作比赛作品

**线上即玩：<https://showdown-reef.top>** 

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
npm run release    # 发布上线：构建 → 提交 → 推双远端（见「发布」）
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

标题页右下角还有一枚「中国反走私」标识 —— 它不是开关，是静态装饰，
也是全项目唯一的位图素材（来历见下面「素材与 AI 使用」）。

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

## 发布

线上是 **GitHub → Vercel** 自动构建，一条命令走完：

```bash
npm run release                     # 构建 → 提交 → 推 Gitee + GitHub
npm run release -- "修了存档的 bug"   # 自定义提交信息
npm run release -- --dry-run        # 只演流程：不构建、不提交、不推送
npm run release -- --push-only      # 只补推当前 HEAD（网络抽风后补推用）
```

推上去 Vercel 自己会重新构建，一两分钟后 <https://showdown-reef.top> 就是新的，
**没有任何需要手点的步骤**。

脚本按顺序做四件事：`npm run build`（构建失败就停，一个字节都不提交）→
`git add -A` → `commit` → 逐个远端推送。

两个远端是**分开推、分别报结果**的 —— GitHub 挂掉不会让整条命令返回非零，
也就不会让人误以为「全都没推上去」而白干一遍。

| 远端 | 用途 |
|---|---|
| GitHub `sjcn3/GAME-showdown-reef` | Vercel 从这里拉代码，**生产链路** |
| Gitee `sjcn3/GAME-showdown-reef` | 免费的异地代码备份，不部署 |

> Gitee Pages 已于 2024 年前后停止服务，**不要再去开通** —— 免费版本来也不支持
> 自定义域名，而且每次发布要手点「更新」、没有 API。留 Gitee 仓库只为多一份备份。

### 域名与 DNS

站点挂在自有域名上，解析在腾讯云 DNSPod：

| 主机记录 | 类型 | 记录值 |
|---|---|---|
| `@` | A | `216.198.79.1` |
| `www` | CNAME | `87eaffa712fdf834.vercel-dns-017.com` |

NS 是 `maria.dnspod.net` / `trousers.dnspod.net`，证书由 Vercel 自动签发、自动续期。

> 当初 `*.vercel.app` 在国内打不开，换成自有域名就通了 —— 被针对的是那个共享域名，
> 不是 Vercel 的 IP。现在国内直连可访问，HTML 和 1.4 MB 的主包都能正常加载。

### 仓库里的部署配置

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
**`dist/` 不进版本库** —— Vercel 每次自己跑 `npm run build`，仓库里不需要有它。

> ⚠️ `.git` 有 54 MB —— 早期提交把 `node_modules` 和 `dist` 一起提交过
> （历史里最大的单个对象 47.7 MB）。推 GitHub 到这个量级慢且容易断。
> 瘦身命令见设计文档 §11.7。
>
> 💡 这台机器上 `github.com` 会解析到一个连不上的 IP，所以 `release.mjs` 推 GitHub
> 前会**先扫一遍候选出口 IP**，挑一个通的用 `http.curloptResolve` 覆盖解析 ——
> 不动 `hosts`、不要管理员权限。

## 目录

```
src/
  assets/        唯一的位图：标题页那枚「中国反走私」标识
  art/           程序化美术：场景、人物、道具图标、结局插画、动效层
  core/          状态机、存档、结局判定、音效合成
  data/          章节、道具、文档、结局表
  scenes/        Phaser 场景
  ui/            文本框、道具栏、证据列表、面板、章节卡……
  debugPanel.ts  调试入口的开关（见上）
tools/           回归与取证脚本 + release.mjs（不参与打包）
tests/           vitest 单测
docs/            设计文档、剧本、人物概念图、静态截图
shots/           回归截图（不进库）
```

## 素材与 AI 使用

**运行期只有一个位图**：标题页右下角那枚「中国反走私」标识
（`src/assets/logo-fan-zousi.png`，66 kB）。其余美术全部是 Phaser `Graphics`
程序化绘制，音效全部是 Web Audio 实时合成，字体用系统字体栈，
运行期依赖只有 Phaser 一个。

标识为什么不能程序化：图里「中国反走私」五个字是**标准字形**，没有矢量路径可画。
源图 `docs/截图/logo.jpg` 是白底 JPEG，处理过程（去白底、把黑字转浅墨）在
[`tools/_logo.py`](tools/_logo.py)；尺寸与落位决策记在
[`src/ui/CornerMark.ts`](src/ui/CornerMark.ts) 的注释里。

详见设计文档 §10.8（含一条核查命令 —— 现在的预期是"有且只有一个"）。

本游戏由 AI 辅助制作，署名见标题页左下角铜徽。

## 文档

- [`docs/杂项/01-设计文档.md`](docs/杂项/01-设计文档.md) —— 唯一的设计真值来源
- [`docs/杂项/02-剧本全文.md`](docs/杂项/02-剧本全文.md) —— 剧本
- [`docs/人物设计图/`](docs/人物设计图/) —— 三张人物概念图（画立绘时的参考，不进产物）
- [`docs/截图/`](docs/截图/) —— 九张静态截图，不用跑项目也能看成品
