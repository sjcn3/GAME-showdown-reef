import { describe, expect, it } from 'vitest';
import { wrapCjk } from '../src/ui/cjkWrap';

/** 假测量：每个字符 10px 宽（中日韩与西文一视同仁，够用来验证断行规则） */
const mono = (s: string) => s.length * 10;

/** 断行后的行数组 */
const lines = (text: string, width: number) => wrapCjk(text, width, mono).split('\n');

describe('中文折行（避头尾）', () => {
  it('收尾标点不会被甩到行首', () => {
    // 宽度刚好放得下 5 个字，「。」本该被挤到第二行
    const out = lines('他说完了。', 50);
    for (const line of out) {
      expect('，。、；：？！）」』'.includes(line[0]!)).toBe(false);
    }
    expect(out.join('')).toBe('他说完了。');
  });

  it('连续收尾标点同样留在行内', () => {
    const out = lines('真的吗？！', 40);
    for (const line of out) {
      expect('，。、；：？！）」』'.includes(line[0]!)).toBe(false);
    }
  });

  it('起始标点不会吊在行尾', () => {
    const out = lines('他说（其实不是）', 60);
    for (const line of out) {
      expect('（「『【《'.includes(line[line.length - 1]!)).toBe(false);
    }
    expect(out.join('')).toBe('他说（其实不是）');
  });

  it('西文单词不会被从中间切开', () => {
    const out = lines('see the harbour light', 120);
    for (const line of out) {
      // 切开的话会出现半个单词，检查每行两端的字符都不是半截词
      expect(line.trim()).toBe(line);
    }
    expect(out.join(' ').replace(/\s+/g, ' ')).toBe('see the harbour light');
  });

  it('保留显式换行与空行', () => {
    expect(wrapCjk('第一段\n\n第二段', 100, mono)).toBe('第一段\n\n第二段');
  });

  it('不产生空行', () => {
    const out = lines('潮水退去，码头终于露出了干净的礁石。', 70);
    expect(out.every((l) => l.length > 0)).toBe(true);
  });

  it('长文本不丢字', () => {
    const src = '你连支援都没等，一个人推开了仓库门。里面是空的。防雨布下面，连一个箱子都没有。';
    const out = lines(src, 150);
    expect(out.join('')).toBe(src);
  });
});
