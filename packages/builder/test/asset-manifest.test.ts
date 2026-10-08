/**
 * 资产标签注入与预渲染落盘目录（2026-09-16 修复的两个产物级缺陷）。
 *
 * 两个缺陷都不是「代码写错」而是「接线错」，且都**静默**：
 *
 * 1. `virtual:ubean-asset-manifest` 有两个提供者，核心插件那份 ref 只在它自己的 `buildApp` 里
 *    被填 —— CLI 驱动的两条路径都拿到空的，于是生产 HTML 里既没有客户端入口 `<script>` 也没有
 *    样式表。文件清单比对与体积门禁都看不见（HTML 内容不在比对范围内），是 RM-V24 的
 *    `vite preview` 验收断言把它逼出来的。
 * 2. `prerender.staticDir` 的默认值写死 `'dist/public'`，不跟随 `build.outputDir` ——
 *    `ubean build --outDir .temp-x` 时客户端产物落在 `.temp-x/public`、预渲染 HTML 却写进
 *    `dist/public`，产物被劈成两半且两边都不报错。
 *
 * 因此这里的断言都是「取值规则」级：把两个缺陷的判据固定住。
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolvePrerenderStaticDir } from '../src/prerender';
import {
  clientPublicDirFor,
  computeAssetTags,
  readClientManifestFromDisk,
  resolveInjectedAssetTags
} from '../src/vite/asset-manifest';

let root: string;

/**
 * TS-13（OS 矩阵）：下面这些断言比较的是**文件系统绝对路径**，期望值必须用平台原生的分隔符与
 * 盘符构造。原先把它们写成 `'/app/dist/public'`、`'/abs/site'` 这类 POSIX 字面量 —— 在
 * macOS/Linux 上恰好等价，在 Windows 上**必然红**，而且是两重原因：
 * 1. 实现走 `join()`，在 Windows 上产出 `\` 分隔符，字面量 `'/'` 比不过；
 * 2. `'/abs/site'` 在 Windows 上**不是**绝对路径（需要盘符或 UNC），于是 `resolvePrerenderStaticDir`
 *    会走「拼 cwd」那条分支，语义与断言假设完全不同。
 * 用 `resolve()` 构造基准，两平台都得到该平台的绝对路径，断言的语义（兄弟目录 / 派生 public /
 * 显式 staticDir 优先）保持不变。
 */
const appRoot = resolve('/app');
const absOut = resolve('/tmp/out');
const absStatic = resolve('/abs/site');

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'ubean-asset-tags-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const ENTRY_MANIFEST = {
  '.ubean/virtual/client-entry.mjs': { file: 'assets/app-abc123.js', isEntry: true },
  'src/pages/index.vue': { file: 'assets/index-def456.js' }
};

describe('computeAssetTags', () => {
  // 历史事故 #2（RM-V21「体积门禁全绿但产物空」）的产物侧判据，由 RM-V24 接管 `vite preview` 时的
  // 验收断言逼出来：`virtual:ubean-asset-manifest` 有两个提供者，核心插件那份 ref 只在它自己的
  // `buildApp` 里被填 → CLI 驱动的路径拿到空值 → 生产 HTML 既无入口 `<script>` 也无样式表。
  // 文件清单比对与体积门禁都看不见（HTML 内容不在比对范围内）。
  it('从 entry 项派生 `<script type="module">`', () => {
    expect(computeAssetTags(ENTRY_MANIFEST).body).toBe('<script type="module" src="/assets/app-abc123.js"></script>');
  });

  it('entry 声明 css 时逐个产出 stylesheet link', () => {
    const tags = computeAssetTags({
      entry: { file: 'assets/app.js', isEntry: true, css: ['assets/app.css', 'assets/page.css'] }
    });
    expect(tags.css).toBe(
      '<link rel="stylesheet" href="/assets/app.css">\n<link rel="stylesheet" href="/assets/page.css">'
    );
  });

  it('清单缺失或没有 entry 时给出空标签（不抛错）', () => {
    expect(computeAssetTags(null).body).toBe('');
    expect(computeAssetTags({ 'src/x.vue': { file: 'assets/x.js' } }).body).toBe('');
  });
});

describe('resolveInjectedAssetTags', () => {
  it('内存 manifest 优先（RM-V18 的传递路径）', () => {
    const result = resolveInjectedAssetTags(ENTRY_MANIFEST, undefined);
    expect(result.source).toBe('memory');
    expect(result.tags.body).toContain('/assets/app-abc123.js');
  });

  it('内存缺失时按服务端 outDir 旁的磁盘清单兜底', () => {
    const outDir = join(root, 'dist-ok');
    mkdirSync(join(outDir, 'public', '.vite'), { recursive: true });
    writeFileSync(join(outDir, 'public', '.vite', 'manifest.json'), JSON.stringify(ENTRY_MANIFEST));

    const result = resolveInjectedAssetTags(null, join(outDir, 'server'));
    expect(result.source).toBe('disk');
    expect(result.tags.body).toContain('/assets/app-abc123.js');
  });

  it('两处都没有时标签为空且来源为 none（调用方据此告警）', () => {
    const result = resolveInjectedAssetTags(null, join(root, 'dist-missing', 'server'));
    expect(result.source).toBe('none');
    expect(result.tags.body).toBe('');
  });
});

describe('clientPublicDirFor', () => {
  it('服务端 outDir 的兄弟目录即客户端产物目录', () => {
    expect(clientPublicDirFor(join(appRoot, 'dist', 'server'))).toBe(join(appRoot, 'dist', 'public'));
  });

  it('读盘失败（清单损坏/缺失）时返回 null 而不是抛错', () => {
    const outDir = join(root, 'dist-broken');
    mkdirSync(join(outDir, 'public', '.vite'), { recursive: true });
    writeFileSync(join(outDir, 'public', '.vite', 'manifest.json'), '{ not json');
    expect(readClientManifestFromDisk(join(outDir, 'public'))).toBeNull();
  });
});

describe('resolvePrerenderStaticDir', () => {
  it('未配置时从构建产物目录派生 `<outputDir>/public`', () => {
    expect(resolvePrerenderStaticDir(appRoot, 'dist', {})).toBe(join(appRoot, 'dist', 'public'));
    expect(resolvePrerenderStaticDir(appRoot, '.temp-x', {})).toBe(join(appRoot, '.temp-x', 'public'));
  });

  it('产物目录是绝对路径时不再拼 cwd（`--outDir` 可传绝对路径）', () => {
    expect(resolvePrerenderStaticDir(appRoot, absOut, {})).toBe(join(absOut, 'public'));
  });

  it('显式配置的 staticDir 优先（相对与绝对都支持）', () => {
    expect(resolvePrerenderStaticDir(appRoot, 'dist', { staticDir: 'build/site' })).toBe(
      join(appRoot, 'build', 'site')
    );
    expect(resolvePrerenderStaticDir(appRoot, 'dist', { staticDir: absStatic })).toBe(absStatic);
  });
});
