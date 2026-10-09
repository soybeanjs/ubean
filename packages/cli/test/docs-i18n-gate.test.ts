/**
 * 历史事故 #5（RM-T03）—— 文档 i18n 门禁本身零测试覆盖，而它守的东西已经漂移过一次。
 *
 * 事故现场：`apps/docs/src/content/zh/` 的译文与 `en/` 源文脱节（源文改了、译文没跟上），
 * 站点上于是长期挂着**过时的中文正文**；同时 `src/locales/{en,zh}.json` 的消息键集合
 * 悄悄分叉（重命名后 zh 侧残留旧键、缺新键）。两件事都不会让任何测试变红 —— 直到
 * `scripts/i18n-check.mjs`（commit `2209db5`）作为 CI 步骤出现。
 *
 * 为什么还要给门禁本身写测试：门禁是**唯一的**观测点，它自己坏掉是静默的。
 * 实测该脚本 0.048s，且 `packages/<pkg>/test/` 与 `apps/` 里 `grep -rln i18n/lib.mjs`
 * 全为空 —— 也就是说「漂移会被拦下」这件事，此前只有一句注释在承诺。
 *
 * 分两层守：
 * 1. **纯函数层**（`scripts/i18n/lib.mjs`）：`sourceHash` / `isTranslationStub` /
 *    `readFrontmatterField` / `diffStructure` 的判据。这四个函数决定了「什么算漂移」，
 *    翻译器（`i18n-translate.mjs`）与门禁共用同一份实现，改错会同时放过两边。
 * 2. **真实仓库层**：`listSiteContent()` 与 `apps/docs/src/locales` 的当前状态。
 *    这一层是「现在没漂移」的快照 —— 它红了说明**内容**要修，不是测试要改。
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '../../..');
const libPath = join(repoRoot, 'scripts/i18n/lib.mjs');
const checkScript = join(repoRoot, 'scripts/i18n-check.mjs');

interface I18nLib {
  SITE_LOCALES_DIR: string;
  SOURCE_LOCALE: string;
  TARGET_LOCALE: string;
  NOT_TRANSLATED: { path: string; why: string }[];
  splitFrontmatter: (source: string) => { frontmatter: string | null; body: string };
  readFrontmatterField: (frontmatter: string | null, key: string) => string | undefined;
  isTranslationStub: (source: string) => boolean;
  sourceHash: (source: string) => string;
  listSiteContent: () => { slug: string; enPath: string; zhPath: string; en: string; zh: string | null }[];
  diffStructure: (en: string, zh: string) => string[];
  loadGlossary: () => Record<string, string>;
}

const lib = (await import(libPath)) as I18nLib;

/** 展平嵌套 JSON → `a.b.c` 键集合（与门禁第 4 段同形）。 */
function flattenKeys(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${k}` : k)
  );
}

const EN_MD = ['---', 'title: Overview', '---', '', '# Overview', '', 'Body text.', ''].join('\n');

describe('文档 i18n 漂移判据（RM-T03）', () => {
  it('sourceHash 只看正文：frontmatter 改动不算漂移，行尾/行尾空白差异也不算', () => {
    // frontmatter 里 `translatedFrom` 本身是**被写入**的字段，如果它参与哈希，
    // 盖章动作会改哈希 → 下一次校验必然报漂移 → 门禁永远红。所以必须排除。
    const a = ['---', 'title: A', 'translatedFrom: deadbeef', '---', 'body', ''].join('\n');
    const b = ['---', 'title: B', '---', 'body', ''].join('\n');
    expect(lib.sourceHash(a)).toBe(lib.sourceHash(b));

    // Windows 检出 / 编辑器改行尾、尾部空格不应触发整站重译。
    expect(lib.sourceHash('body  \r\n')).toBe(lib.sourceHash('body\n'));

    // 正文真变了就必须变（否则「源漂移」这一类永远空着，门禁形同虚设）。
    expect(lib.sourceHash('body one\n')).not.toBe(lib.sourceHash('body two\n'));
  });

  it('isTranslationStub 只认 frontmatter 里的 status: translated-stub', () => {
    expect(lib.isTranslationStub(['---', 'status: translated-stub', '---', 'x', ''].join('\n'))).toBe(true);
    // 正文里出现同样的字样不算 —— 否则文档里提到这个机制就会被误判成未翻译。
    expect(lib.isTranslationStub(['---', 'title: A', '---', 'status: translated-stub', ''].join('\n'))).toBe(false);
    expect(lib.isTranslationStub('no frontmatter at all')).toBe(false);
  });

  it('readFrontmatterField 去掉包裹引号，缺字段返回 undefined', () => {
    expect(lib.readFrontmatterField('translatedFrom: "abc123"', 'translatedFrom')).toBe('abc123');
    expect(lib.readFrontmatterField("translatedFrom: 'abc123'", 'translatedFrom')).toBe('abc123');
    expect(lib.readFrontmatterField('title: A', 'translatedFrom')).toBeUndefined();
    expect(lib.readFrontmatterField(null, 'translatedFrom')).toBeUndefined();
  });

  it('diffStructure 抓结构破坏，但不因「标题文案被翻译」而误报', () => {
    const zh = ['---', 'title: 概览', '---', '', '# 概览', '', '正文。', ''].join('\n');
    expect(lib.diffStructure(EN_MD, zh)).toEqual([]);

    // 多/少一个标题层级
    expect(lib.diffStructure(EN_MD, `${zh}\n## 附加\n`).join('')).toContain('标题层级数量不符');
    // 代码块语言标注被翻译工具改写（实测 DeepL 会把 ts 变 TS）
    const withFence = `${EN_MD}\n\`\`\`ts\nconst a = 1;\n\`\`\`\n`;
    const fenceChanged = withFence.replace('```ts', '```TS');
    expect(lib.diffStructure(withFence, fenceChanged).join('')).toContain('代码块语言标注');
    // 表格行被翻译工具吞掉
    const withTable = `${EN_MD}\n| a | b |\n| - | - |\n| 1 | 2 |\n`;
    expect(lib.diffStructure(withTable, `${EN_MD}\n| a | b |\n| - | - |\n`).join('')).toContain('表格行数不符');
  });

  it('术语表丢掉含 `/` 的条目 —— 那是上下文二选一的译法，不能直接替换', () => {
    // `server / client` → `服务端 / 客户端`（作定语时不加「的」）。直接替换会把
    // `The server renders and the client hydrates.` 变成 `The 服务端 / 客户端
    // renders and the 服务端 / 客户端 hydrates.` —— 正文里凭空多出一个带斜杠的
    // 复合词，比不校正更糟。
    const glossary = lib.loadGlossary();
    expect(glossary.server).toBeUndefined();
    expect(glossary.client).toBeUndefined();
    expect(glossary.build).toBeUndefined();

    // 正常条目（单一译法）不受影响 —— 否则这条修正会把术语校正整体关掉。
    expect(glossary.islands).toBeTruthy();
    expect(glossary.hydration).toBeTruthy();
    expect(Object.values(glossary).some(value => value.includes('/'))).toBe(false);
  });

  it('刻意不翻译的面是有理由的清单，不是注释', () => {
    // 这份清单是流程的一部分：没有它，每次有人问「README / ADR / skills 怎么没译」
    // 都要重新论证一遍。断言它存在且每条都写了理由（空 why 等于没写）。
    expect(lib.NOT_TRANSLATED.length).toBeGreaterThan(0);
    for (const item of lib.NOT_TRANSLATED) {
      expect(item.path, 'NOT_TRANSLATED 条目的 path 为空').toBeTruthy();
      expect(item.why.length, `${item.path} 缺少理由`).toBeGreaterThan(0);
    }
    expect(lib.NOT_TRANSLATED.map(item => item.path)).toContain('docs/**');
  });
});

describe('文档 i18n 当前状态（RM-T03）', () => {
  it('每个 en 内容页都有非占位的中文译文', () => {
    const items = lib.listSiteContent();
    // 站点规模：`apps/docs/src/content/{en,zh}` 各 30 个 .md（实测）。数量为 0 说明
    // 目录被搬走而门禁还在「通过」—— 这是最危险的静默形态。
    expect(items.length).toBeGreaterThan(20);

    const missing = items.filter(item => item.zh === null).map(item => item.slug);
    const stubs = items.filter(item => item.zh !== null && lib.isTranslationStub(item.zh!)).map(item => item.slug);
    expect({ missing, stubs }).toEqual({ missing: [], stubs: [] });
  });

  it('译文的 translatedFrom 标记与 en 正文哈希一致', () => {
    const drifted = lib
      .listSiteContent()
      .filter(item => item.zh !== null)
      .map(item => ({
        slug: item.slug,
        expected: lib.sourceHash(item.en),
        actual: lib.readFrontmatterField(lib.splitFrontmatter(item.zh!).frontmatter, 'translatedFrom')
      }))
      .filter(row => row.actual !== row.expected)
      .map(row => `${row.slug}（zh: ${row.actual ?? '无标记'}，应为 ${row.expected}）`);

    // 红了说明译文过期 —— 跑 `node scripts/i18n-translate.mjs <slug>` 再
    // `node scripts/i18n-stamp.mjs`，**不要**改这条断言。
    expect(drifted).toEqual([]);
  });

  it('站点消息目录 en / zh 的键集合完全一致', () => {
    const enKeys = new Set(flattenKeys(JSON.parse(readFileSync(join(lib.SITE_LOCALES_DIR, 'en.json'), 'utf8'))));
    const zhKeys = new Set(flattenKeys(JSON.parse(readFileSync(join(lib.SITE_LOCALES_DIR, 'zh.json'), 'utf8'))));

    const missingInZh = [...enKeys].filter(key => !zhKeys.has(key));
    const staleInZh = [...zhKeys].filter(key => !enKeys.has(key));
    expect({ missingInZh, staleInZh }).toEqual({ missingInZh: [], staleInZh: [] });
  });

  it('门禁脚本真的会以非零退出码拦下漂移（红证：改 --max-drift 不影响缺译文）', () => {
    // 直接跑真实脚本，确认「当前仓库是绿的」这条结论来自门禁本身而不是我们的复述。
    const pass = spawnSync(process.execPath, [checkScript], { cwd: repoRoot, encoding: 'utf8' });
    expect(pass.status, pass.stdout + pass.stderr).toBe(0);
    expect(pass.stdout).toContain('文档国际化校验通过');

    // `--json` 的输出必须与退出码同源（CI 里两个消费者：退出码 gate + 日志）。
    const json = spawnSync(process.execPath, [checkScript, '--json'], { cwd: repoRoot, encoding: 'utf8' });
    expect(json.status).toBe(0);
    const payload = JSON.parse(json.stdout) as { ok: boolean; problems: Record<string, unknown[]> };
    expect(payload.ok).toBe(true);
    expect(Object.values(payload.problems).every(rows => rows.length === 0)).toBe(true);

    // 缺译文 / 结构不符 / 消息目录三类**不受 `--max-drift` 容忍**（只有源漂移受）。
    // 这条守着「容忍度被误用来放过缺译文」这个退化方向：源码里三类各自单独相加。
    const source = readFileSync(checkScript, 'utf8');
    expect(source).toMatch(
      /problems\.missing\.length\s*\+\s*problems\.structure\.length\s*\+\s*problems\.locales\.length/u
    );
    expect(source).toMatch(/Math\.max\(0,\s*problems\.drifted\.length - maxDrift\)/u);
  });
});
