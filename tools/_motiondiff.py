# 对比 `tools/steps/_motion.json` 里相隔一段时间的两张同场景截图，确认画面真的在动。
#
# 为什么需要它：动效"有没有在动"是**断言证不了**的 —— tween 挂着、属性也在变，
# 但图层可能被别的 Graphics 盖住、或者 alpha 低到看不见。只有把同一场景的两帧
# 相减、数一数有多少像素变了，才算证过。改完 `ambient.ts` / `sceneAmbient.ts` 就跑一次。
#
# 用法：先 `node tools/smoke.mjs --steps-file tools/steps/_motion.json ... --report shots/_motion/report.json`，
# 再 `python tools/_motiondiff.py`。两帧都取 720×1280（桌面尺寸）。
import sys
from pathlib import Path
from PIL import Image, ImageChops

PAIRS = [
    ("dock", "湿地/海面/尘埃/老周呼吸/海雾/烟"),
    ("corridor", "三盏灯/地面反光/尘埃"),
    ("bilge", "手电光柱里的尘埃/舱底油气"),
    ("approach", "玻璃外的雨/灯闪/水膜"),
    ("night", "大雨/湿地反光/两人各自的呼吸"),
]


def main() -> int:
    root = Path(__file__).resolve().parent.parent / "shots" / "_motion"
    for name, what in PAIRS:
        a = Image.open(root / f"{name}-a.png").convert("RGB")
        b = Image.open(root / f"{name}-b.png").convert("RGB")
        d = ImageChops.difference(a, b)
        bbox = d.getbbox()
        hist = d.convert("L").histogram()
        changed = sum(hist[1:])          # 亮度差 > 0 的像素数
        strong = sum(hist[8:])           # 亮度差 >= 8 的像素数
        total = a.width * a.height
        print(f"{name:10s} 变了 {changed:7d}/{total} ({changed * 100.0 / total:5.1f}%)  "
              f"明显 {strong:6d} ({strong * 100.0 / total:4.1f}%)  bbox={bbox}   <- {what}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
