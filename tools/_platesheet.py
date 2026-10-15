"""把六张结局插画裁出来拼成一张长图，用来一眼比对六张构图。

插画槽位：EndingScene 的 (62, PLATE_TOP=796, w=596, h=250)。
改 `src/art/endingPlates.ts` 之后跑一次：单看一张图看不出"六张是不是真的不一样"，
拼在一起才看得出来 —— 而"六个结局读起来是同一件事"正是这一版要修的问题。

用法：先 `node tools/smoke.mjs --steps-file tools/steps/_plates.json ...`，
再 `python tools/_platesheet.py`。图在 `shots/_plates/`。
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent / "shots" / "_plates"
OUT = ROOT / "sheet.png"
BOX = (62, 796, 62 + 596, 796 + 250)

NAMES = [
    ("1-tide_ebb", "tide_ebb  chaoluo"),
    ("2-torn_page", "torn_page  canye"),
    ("3-lost_emblem", "lost_emblem  yihui"),
    ("4-broken_number", "broken_number  duanhao"),
    ("5-hollow_win", "hollow_win  wuzhengzhisheng"),
    ("6-tipped_off", "tipped_off  dacaojingshe"),
]

GAP, LABEL = 10, 22
W = BOX[2] - BOX[0]
H = BOX[3] - BOX[1]
sheet = Image.new("RGB", (W, len(NAMES) * (H + LABEL + GAP)), (16, 16, 16))
d = ImageDraw.Draw(sheet)

for i, (f, label) in enumerate(NAMES):
    img = Image.open(ROOT / f"{f}.png").convert("RGB").crop(BOX)
    y = i * (H + LABEL + GAP)
    sheet.paste(img, (0, y + LABEL))
    d.text((4, y + 5), label, fill=(200, 200, 200))

sheet.save(OUT)
print("saved", OUT, sheet.size)
