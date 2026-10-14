import type Phaser from 'phaser';

/**
 * 中文折行：不让标点出现在行首。
 *
 * Phaser 自带的 `useAdvancedWrap` 是按空格断词的西文逻辑，遇到中文只能逐字硬断，
 * 于是会出现「……他殉职的日 / 。」这种把句号甩到下一行开头的版式事故 ——
 * 中文排版的硬规矩是行首不能有收尾标点、行尾不能有起始标点（避头尾）。
 *
 * 用法：`wordWrap: { width: 596, callback: cjkWrap }`。
 * 换成 callback 之后 Phaser 不再自己断行，宽度判断全在这里做。
 */

/** 不能出现在行首的收尾标点（避头） */
const NO_LINE_START = '，。、；：？！）〕】》」』〉…—·”“’';
/** 不能出现在行尾的起始标点（避尾） */
const NO_LINE_END = '（〔【《「『〈“‘';

/**
 * 纯函数版折行：测量方式由调用方注入，因此可以脱离 Phaser 单测。
 *
 * @param measure 给定字符串返回其渲染宽度（须与最终渲染同源）
 */
export function wrapCjk(
  text: string,
  width: number,
  measure: (s: string) => number,
): string {
  const out: string[] = [];

  for (const para of text.split('\n')) {
    if (para === '') {
      out.push('');
      continue;
    }

    let line = '';
    let i = 0;
    while (i < para.length) {
      const ch = para[i]!;
      if (line === '' || measure(line + ch) <= width) {
        line += ch;
        i++;
        continue;
      }

      // 走到这里说明 line + ch 超宽了。
      if (NO_LINE_START.includes(ch)) {
        // 悬挂标点：宁可让本行多出一个字，也不把标点甩到下一行开头。
        //
        // 这里**不能收行**。一旦收行，紧跟着的第二个收尾标点会立刻变成
        // 新行的第一个字 —— 而上面那条 `line === ''` 的分支是无条件接纳的，
        // 于是排出一整行只有标点的版式事故：
        //     ……不是"木制工艺品
        //     ”。
        // （截图 02-ch1-dock-opening-text.png 实测就是这个形状。）
        // 所以继续往本行上挂；下一个正常字会走下面的断行分支把这一行收掉。
        line += ch;
        i++;
        continue;
      }

      const cut = backOffWord(line);
      let head = line.slice(0, cut).replace(/\s+$/, '');
      let carry = line.slice(cut).replace(/^\s+/, '');
      // 行尾吊着一个起始标点同样难看，把它一起挪到下一行
      while (head.length > 1 && NO_LINE_END.includes(head[head.length - 1]!)) {
        carry = head[head.length - 1]! + carry;
        head = head.slice(0, -1);
      }

      if (head === '') {
        // 整行就是一个超长单词、或整行都是空白：无处可断，让它留在本行别产生空行
        out.push(line);
        line = carry;
        continue;
      }
      out.push(head);
      line = carry;
      // i 不动：当前这个字进入下一行
    }
    out.push(line.replace(/\s+$/, ''));
  }

  return out.join('\n');
}

/** 西文单词不从中间切开；整行只有一个词时放弃回退 */
function backOffWord(line: string): number {
  const isWordChar = (ch: string | undefined) => !!ch && /[0-9A-Za-z_'’-]/.test(ch);
  if (!isWordChar(line[line.length - 1])) return line.length;
  let i = line.length;
  while (i > 0 && isWordChar(line[i - 1])) i--;
  return i > 0 ? i : line.length;
}

/** 行宽：优先用 text 对象自己的折行宽度，没设就退回画布宽度 */
function wrapWidth(textObject: Phaser.GameObjects.Text): number {
  const w = textObject.style?.wordWrapWidth;
  if (typeof w === 'number' && w > 0) return w;
  return textObject.scene?.scale?.width ?? Number.MAX_SAFE_INTEGER;
}

/** 直接当 Phaser 的 `wordWrap.callback` 用 */
export function cjkWrap(text: string, textObject: Phaser.GameObjects.Text): string {
  return wrapCjk(text, wrapWidth(textObject), (s) => textObject.context.measureText(s).width);
}
