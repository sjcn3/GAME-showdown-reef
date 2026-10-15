"""把 docs/截图/logo.jpg 处理成能嵌进《暗礁》标题页右下角的透明 PNG。

源图是白底 JPEG：直接放上去就是一块白贴纸。这里做三件事：
  1. 去白底（按 min(r,g,b) 反解 alpha，再做一次反预乘），黑字才不会糊成灰边
  2. 分离「红盾」与「黑字」两类像素 —— 黑字在黑底上等于隐形，必须换成浅墨色
  3. 裁到内容外框后缩放到目标高度

只输出到 tools/_logo_out/，不动源图。
"""
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(r"D:\example\an-jiao\docs\截图\logo.jpg")
OUT = Path(r"D:\example\an-jiao\tools\_logo_out")
OUT.mkdir(exist_ok=True)

TARGET_H = 256          # 输出高度（显示尺寸的 ~3 倍，缩下去才锐）
TEXT_RGB = (200, 210, 216)   # 黑字 → 浅墨（COLORS.ink 一档）
RED_KEEP = 0.94         # 红盾整体压一点点，别在夜景里打眼
ALPHA_FLOOR = 0.06      # JPEG 噪声底：低于此的一律全透明

im = Image.open(SRC).convert("RGB")
w, h = im.size
a = np.asarray(im).astype(np.float32)
print(f"源图      {w}x{h}  ({SRC.stat().st_size / 1024:.1f} KB)")

# ── 背景判定 ──
corners = np.stack([a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]])
print(f"四角均值  {corners.mean(axis=0).round(1)}  (应当接近 255 = 白底)")

# ── alpha：白底反解。min(r,g,b) 越接近 255 越透明 ──
mn = a.min(axis=2)
alpha = 1.0 - mn / 255.0
alpha[alpha < ALPHA_FLOOR] = 0.0

# ── 反预乘：把「白底贡献」从颜色里减掉，否则红盾边缘会拖一圈粉白 ──
safe = np.maximum(alpha, 1e-6)[..., None]
color = (a - (1.0 - safe) * 255.0) / safe
color = np.clip(color, 0, 255)

# ── 分类：高饱和且红占优 = 红盾；其余 = 黑字 ──
mx = color.max(axis=2)
sat = mx - color.min(axis=2)
is_red = (sat > 40) & (color[..., 0] > color[..., 1] + 20)

print(f"红盾像素  {int(is_red.sum())}  ({is_red.mean() * 100:.1f}%)")
if is_red.any():
    print(f"红盾主色  {color[is_red].mean(axis=0).round(0)}  (源图里的红)")
print(f"文字像素  {int((~is_red & (alpha > 0.5)).sum())}")

# 红盾微调、文字换色
color[is_red] *= RED_KEEP
color[~is_red] = TEXT_RGB

rgba = np.dstack([color, alpha * 255.0]).astype(np.uint8)
img = Image.fromarray(rgba, "RGBA")

# ── 裁到内容外框 ──
bbox = img.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
print(f"内容外框  {bbox}")
img = img.crop(bbox)

# ── 缩放到目标高度 ──
cw, ch = img.size
img = img.resize((max(1, round(cw * TARGET_H / ch)), TARGET_H), Image.LANCZOS)
print(f"输出尺寸  {img.size[0]}x{img.size[1]}  (比例 {img.size[0] / img.size[1]:.3f})")

dst = OUT / "logo.png"
img.save(dst)
print(f"已写出    {dst}  ({dst.stat().st_size / 1024:.1f} KB)")

# ── 预览：贴在标题页右下角那块的实际底色上 ──
for label, bg, disp_h in (("实际大小-暗底", (14, 7, 8), 84), ("放大-暗底", (14, 7, 8), 220)):
    pw, ph = disp_h * 2 + 120, disp_h + 120
    canvas = Image.new("RGBA", (pw, ph), bg + (255,))
    preview = img.resize((max(1, round(img.size[0] * disp_h / img.size[1])), disp_h), Image.LANCZOS)
    canvas.alpha_composite(preview, ((pw - preview.size[0]) // 2, (ph - preview.size[1]) // 2))
    p = OUT / f"preview-{label}.png"
    canvas.convert("RGB").save(p)
    print(f"预览      {p}")
