# 截图

这里是**刻意挑出来的一组静态截图**，用来让人不用跑项目也能看到成品长什么样。

回归脚本每次跑都会重拍上百张图（雨、尘埃、灯光呼吸的相位每次都不同，
97 张里有 68 张会变），所以 `shots/` 整个目录不进版本库 ——
要最新的图，跑 `node tools/regress.mjs --mobile` 就有了。

本目录的图是手动挑的，只在**美术真的改了**的时候才更新一次。

| 图 | 内容 | 来源 |
|---|---|---|
| [01-标题页.png](01-%E6%A0%87%E9%A2%98%E9%A1%B5.png) | 标题页：月亮、港区剪影、雨，左下角铜徽点开制作信息 | `shots/title/00-title.png` |
| [02-第一章码头.png](02-%E7%AC%AC%E4%B8%80%E7%AB%A0%E7%A0%81%E5%A4%B4.png) | 第一章码头：老周、烟、海面薄雾、水面反光 | `shots/audit/03-ch1-dock.png` |
| [03-船长室.png](03-%E8%88%B9%E9%95%BF%E5%AE%A4.png) | 第二章船长室：会呼吸的舱顶灯 + 光柱里的尘埃 | `shots/audit/07-ch2-cabin.png` |
| [04-对峙第一回合.png](04-%E5%AF%B9%E5%B3%99%E7%AC%AC%E4%B8%80%E5%9B%9E%E5%90%88.png) | 第三章对峙：陈老板（改高后）与李副局长 | `shots/p3/p3-03-round1.png` |
| [05-对话框.png](05-%E5%AF%B9%E8%AF%9D%E6%A1%86.png) | 对话框：面板下半截渐隐进场景，不再有硬边 | `shots/_textbox/long.png` |
| [06-六张结局插画.png](06-%E5%85%AD%E5%BC%A0%E7%BB%93%E5%B1%80%E6%8F%92%E7%94%BB.png) | 六个结局各一张构图（_platesheet.py 拼的对照图） | `shots/_plates/sheet.png` |
| [07-结局图鉴.png](07-%E7%BB%93%E5%B1%80%E5%9B%BE%E9%89%B4.png) | 图鉴：六格插画缩略图 + 名称 + 摘要 + 层级 | `shots/_gallery/full.png` |
| [08-章节卡.png](08-%E7%AB%A0%E8%8A%82%E5%8D%A1.png) | 章节卡：底板跟着章节染色，序号水印 + 四角角标 | `shots/_chapter/card1.png` |
| [09-人物对照.png](09-%E4%BA%BA%E7%89%A9%E5%AF%B9%E7%85%A7.png) | 左列概念图、右列游戏内渲染（老周 / 陈老板 / 李副局长） | `shots/chars/compare.png` |

## 更新方法

跑一遍回归，然后把上面「来源」那一列的文件复制过来覆盖即可：

```powershell
node tools/regress.mjs --mobile
python tools/_platesheet.py        # 重新拼 06 那张结局插画对照图
```
