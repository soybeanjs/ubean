/**
 * Azure Translator 驱动（`scripts/i18n/azure.mjs`）—— 请求层的行为锁。
 *
 * 为什么这个文件必须存在：驱动里几乎所有非平凡决定都来自**实测**（见 azure.mjs
 * 头部与 docs/i18n.md 的「引擎差异」表），而不是文档承诺。这些实测结论很容易在
 * 一次「看起来更简洁」的重构里被抹掉，且抹掉后**没有任何东西会变红**：
 *
 *   - 占位符形态换回 `§0§` / `\uE000` → Azure 会改坏它 → 译文里出现裸占位符或
 *     丢失组件标签。而结构校验卡口**不会**报错：标签被占位符替换后，链接条数在
 *     en 与 zh 上都算 0，两边一致。
 *   - 行内代码回填成 `<code>x</code>` 而非反引号 → 结构指纹的 `inlineCode` 在 zh
 *     侧归零 → 卡口把**好译文**报成结构破坏（2026-09 实测踩到，本文件锁住）。
 *   - 去掉实体转义 → `A & B` 触发 Azure 的实体处理；`a < b` 被当标签。
 *   - 去掉字符分批 → 长表格撞 `400077` 硬上限，整篇失败。
 *
 * 这些用例**不联网**：只测纯函数与本地分批逻辑。真实 API 的形状（`textType=html`
 * 保真度、429 退避）由 docs/i18n.md 记录，CI 不依赖网络。
 */
import { describe, expect, it } from 'vitest';

interface AzureModule {
  encodeLine: (text: string) => { text: string; spans: string[] };
  decodeLine: (text: string, spans: string[]) => string;
  pendingTokens: (text: string) => string[];
  batchByChars: (texts: string[], maxChars?: number) => string[][];
  createAzureTranslator: (options?: { sourceLang?: string; targetLang?: string }) => {
    name: string;
    translateLines: (texts: string[]) => Promise<string[]>;
  };
  postProcess: (line: string, glossary: Record<string, string>) => string;
}

const azure = (await import('../../../scripts/i18n/azure.mjs')) as AzureModule;

/** encode → decode 往返，断言逐字复原（这是「不丢结构」的最强判据）。 */
function roundTrip(line: string): string {
  const { text, spans } = azure.encodeLine(line);
  // 模拟「引擎原样回传」：占位符与标签都不动。真实引擎对纯占位符是保真的
  // （实测 8 个候选形态里只有纯大写字母包裹的数字串全程不被改）。
  return azure.decodeLine(text, spans);
}

describe('Azure 驱动的片段保护（scripts/i18n/azure.mjs）', () => {
  it('encode → decode 逐字复原不可译片段', () => {
    const cases = [
      // 行内代码必须回填**反引号**，不是 `<code>`。回填 HTML 会让结构指纹的
      // inlineCode 在 zh 侧归零，卡口把好译文报成结构破坏。
      'Set `routeRules.prerender` to true.',
      'Use `definePage` and `v-client.load` together.',
      // markdown 链接：裸送会被改成 `（/url）`（全角括号），链接失效
      'See the [routing guide](/guide/routing) for details.',
      'Read [Islands](/guide/islands#partial-hydration) now.',
      'Here is ![cover](/images/a.png) an image.',
      // Vue 组件标签：裸送会把标签名翻译成中文（`<Link>` → `<链接>`）
      'Wrap with <Link to="/guide/x">the guide</Link> please.',
      'Then <SlotView name="dialog" /> renders.',
      'Use <Counter v-client.load /> here.',
      // 裸 HTML
      'See <a href="/x#y">anchors</a> and <code>y</code>.',
      // 组合
      'Use `definePage` then <Link to="/x">guide</Link> and [docs](/d).'
    ];

    for (const line of cases) {
      expect(roundTrip(line), line).toBe(line);
    }
  });

  it('占位符形态是 XQZX<n>XQZX，且不会与英文正文里的真实词冲突', () => {
    const { text, spans } = azure.encodeLine('Set `a` and `b`.');
    expect(spans).toEqual(['`a`', '`b`']);
    expect(text).toBe('Set XQZX0XQZX and XQZX1XQZX.');

    // 形态本身是判据的一部分：`§0§`（序号被当数字重排）、`\uE000`（整段被吞）、
    // `<ph id="0"/>`（属性引号变全角）实测都被 Azure 改坏。
    expect(text).toMatch(/XQZX\d+XQZX/u);
  });

  it('实体转义让 `&` 与游离 `<` 不被当成 HTML 结构', () => {
    expect(azure.encodeLine('A & B').text).toBe('A &amp; B');
    expect(azure.encodeLine('if a < b then').text).toBe('if a &lt; b then');
    // 幂等：已存在的实体不二次转义，否则 `&amp;` 会变成 `&amp;amp;`
    expect(azure.encodeLine('A &amp; B').text).toBe('A &amp; B');
    // 已识别的标签形态（含属性）不被转义
    expect(azure.encodeLine('See <a href="/x">y</a>.').text).toBe('See XQZX0XQZXyXQZX1XQZX.');
  });

  it('decodeLine 还原实体，且 `&amp;` 最后处理（避免二次解码）', () => {
    const { text, spans } = azure.encodeLine('A & B and a < b.');
    // 引擎回传时实体原样；decode 后必须回到原文
    expect(azure.decodeLine(text, spans)).toBe('A & B and a < b.');
    // 显式锁住解码顺序：`&amp;lt;` 必须解成 `&lt;` 而不是 `<`
    expect(azure.decodeLine('&amp;lt;', [])).toBe('&lt;');
  });

  it('pendingTokens 抓出未回填的占位符（引擎改写/丢失的判据）', () => {
    expect(azure.pendingTokens('详情见 XQZX0XQZX。')).toEqual(['XQZX0XQZX']);
    expect(azure.pendingTokens('干净的译文。')).toEqual([]);
  });
});

describe('Azure 驱动的字符分批（scripts/i18n/azure.mjs）', () => {
  it('按字符而非行数切批 —— 长表格行会撞 400077 硬上限', () => {
    // 实测：单请求 >50k 字符 → `400077 The maximum request size has been exceeded.`
    const long = 'x'.repeat(20_000);
    const batches = azure.batchByChars([long, long, long], 45_000);

    // 20k×3 不能塞进一批（含每元素开销会超 45k），必须切成 2 批以上
    expect(batches.length).toBeGreaterThan(1);
    for (const batch of batches) {
      const size = batch.reduce((sum, text) => sum + text.length + 16, 0);
      expect(size).toBeLessThanOrEqual(45_000);
    }
    // 不丢行
    expect(batches.flat()).toHaveLength(3);
  });

  it('单行超过上限时仍单独成批（不静默丢弃）', () => {
    const huge = 'x'.repeat(60_000);
    const batches = azure.batchByChars([huge, 'small'], 45_000);
    expect(batches[0]).toEqual([huge]);
    expect(batches.flat()).toHaveLength(2);
  });

  it('空输入返回空批，不产生空请求', () => {
    expect(azure.batchByChars([])).toEqual([]);
  });
});

describe('Azure 驱动的术语后处理', () => {
  it('术语校正与组件标签归一都生效（与 DeepL 路径共用同一份实现）', () => {
    // Azure 的 `category` 参数只收内置分类值（自定义值返回 400002），所以术语
    // 一致性只能靠本地替换，不能靠服务端术语表。
    expect(azure.postProcess('The islands architecture uses partial hydration.', { islands: '群岛架构' })).toContain(
      '群岛架构'
    );
    // 组件标签大小写被引擎改坏时修回（Vue 组件名大小写敏感，改坏后构建不报错）
    expect(azure.postProcess('<LINK to="/x">y</LINK>', {})).toBe('<Link to="/x">y</Link>');
  });
});

describe('Azure 驱动的密钥与错误处理', () => {
  it('缺少 AZURE_TRANSLATE_KEY 时构造即报错，且报出变量名', () => {
    const original = process.env.AZURE_TRANSLATE_KEY;
    delete process.env.AZURE_TRANSLATE_KEY;
    try {
      expect(() => azure.createAzureTranslator()).toThrow(/AZURE_TRANSLATE_KEY/u);
    } finally {
      if (original !== undefined) process.env.AZURE_TRANSLATE_KEY = original;
    }
  });

  it('name 里带上语言对与区域，便于在日志里确认真的走了 Azure', () => {
    process.env.AZURE_TRANSLATE_KEY ??= 'test-key';
    process.env.AZURE_TRANSLATE_REGION ??= 'southeastasia';
    const translator = azure.createAzureTranslator({ sourceLang: 'en', targetLang: 'zh-Hans' });
    expect(translator.name).toContain('Azure');
    expect(translator.name).toContain('en → zh-Hans');
    expect(translator.name).toContain('southeastasia');
  });
});
