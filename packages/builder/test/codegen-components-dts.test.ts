import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { dirname, join, resolve } from 'pathe';
import { generateAutoImports } from '../src/codegen/auto-imports';

function emptyScan(): ScanResult {
  return {
    apiRoutes: [],
    pages: [],
    layouts: [],
    middlewares: [],
    plugins: [],
    crons: [],
    queues: [],
    locales: [],
    appEntry: { shared: { exists: false }, server: { exists: false }, client: { exists: false } },
    serverEntry: { shared: { exists: false }, dev: { exists: false }, prod: { exists: false } }
  };
}

describe('generateAutoImports components.d.ts format', () => {
  it('emits self-contained inline import entries (unplugin merge-safe)', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-dts-'));
    const componentsDir = join(cwd, 'src/components/islands');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'island-clock.vue'), '<template><span /></template>');

    // ResolvedConfig.srcDir is always absolute (guaranteed by the config loader)
    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });

    const raw = await readFile(result.componentsDtsPath, 'utf8');
    const entryLines = raw.split('\n').filter(line => /^ {4}\w+: /.test(line));
    expect(entryLines.length).toBeGreaterThan(0);

    for (const line of entryLines) {
      // Every entry must carry its own import path. Bare `typeof X` entries lose
      // their meaning when unplugin-vue-components merges this file in dev mode
      // (it preserves interface entries but drops surrounding import statements).
      expect(line, `entry is not self-contained: ${line}`).toMatch(/^ {4}\w+: typeof import\('/);
      expect(line).not.toMatch(/: typeof \w+$/);
    }

    // Builtins stay aligned with UBEAN_BUILTIN_COMPONENTS in ../src/vue-plugin.ts
    for (const name of ['Link', 'Head', 'PageView']) {
      expect(raw).toContain(`${name}: typeof import('ubean/client')['${name}']`);
    }

    // The scanned entry points at the real file, relative to the d.ts directory
    const clockLine = entryLines.find(line => line.startsWith('    IslandClock:'));
    expect(clockLine).toBeDefined();
    expect(clockLine).toContain("./../src/components/islands/island-clock.vue')['default']");
    const match = clockLine!.match(/typeof import\('([^']+)'\)/);
    expect(match).toBeTruthy();
    expect(resolve(dirname(result.componentsDtsPath), match![1])).toBe(join(componentsDir, 'island-clock.vue'));
  });

  /**
   * 两个写入者共存：`components.d.ts` 既被本函数写，也被 unplugin-vue-components 写。
   *
   * 缺陷形态（实测 soybean-admin-v3）：`<SConfigProvider>` 只在 `src/app.vue` 里用，而 app.vue
   * 只在渲染页面时才被加载 —— unplugin 先把它写进 d.ts，随后任意文件改动触发重扫，本函数
   * 整体重写文件、把它抹掉（本函数只扫 `src/components` + 内置 4 个，既不认识模块注册的
   * resolver 也不认识 `RouterLink`/`RouterView`）。表现就是「自动导入时有时无」。
   *
   * 不去遍历 resolver 拿候选名的原因：`@vean/ui` 不导出可枚举的组件清单，resolver 只能按名
   * 查表。没有候选列表就只能合并。
   */
  it('保留上一份文件里由 unplugin 写入的条目（不覆盖式抹掉）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-merge-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'local-widget.vue'), '<template><i /></template>');

    const options = { cwd, srcDir: resolve(cwd, 'src'), buildDir: '.ubean' };

    // 第一次：本函数写出自己的那份
    const first = await generateAutoImports(emptyScan(), options);

    // 模拟 unplugin-vue-components 在 dev 下重写（它的格式：无 `// Auto-generated` 头、
    // 多出 `declare global` 块，条目行形式相同）
    const unpluginVersion = [
      '/* eslint-disable */',
      '// @ts-nocheck',
      "import { GlobalComponents } from 'vue'",
      '',
      'export {}',
      '',
      "declare module 'vue' {",
      '  export interface GlobalComponents {',
      "    LocalWidget: typeof import('./../src/components/local-widget.vue')['default']",
      "    RouterLink: typeof import('vue-router')['RouterLink']",
      "    SButton: typeof import('@vean/ui/button')['SButton']",
      "    SConfigProvider: typeof import('@vean/ui/config-provider')['SConfigProvider']",
      '  }',
      '}',
      ''
    ].join('\n');
    await writeFile(first.componentsDtsPath, unpluginVersion, 'utf-8');

    // 第二次（重扫）：第三方组件必须留下
    const second = await generateAutoImports(emptyScan(), options);
    const raw = await readFile(second.componentsDtsPath, 'utf8');

    for (const kept of ['RouterLink', 'SButton', 'SConfigProvider']) {
      expect(raw, `重扫把 unplugin 写的条目抹掉了: ${kept}`).toContain(`    ${kept}: typeof import('`);
    }
    // 本函数自己的条目照常重新产出（没被上一份的残缺内容带歪）
    expect(raw).toContain("    LocalWidget: typeof import('./../src/components/local-widget.vue')['default']");
    expect(raw).toContain("    Link: typeof import('ubean/client')['Link']");
    // 仍然是我们自己的头部（不是 unplugin 的），两个写入器不会互相反复改写
    expect(raw).toContain('// Auto-generated by ubean');
  });

  it('本次扫描结果覆盖同名旧条目（保持新鲜）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-fresh-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'card.vue'), '<template><i /></template>');

    const options = { cwd, srcDir: resolve(cwd, 'src'), buildDir: '.ubean' };
    const first = await generateAutoImports(emptyScan(), options);

    // 旧文件里 Card 指向一个不存在的路径（模拟组件被移动后的残留）
    await writeFile(
      first.componentsDtsPath,
      [
        "declare module 'vue' {",
        '  export interface GlobalComponents {',
        "    Card: typeof import('./../src/components/old/card.vue')['default']",
        '  }',
        '}',
        ''
      ].join('\n'),
      'utf-8'
    );

    const second = await generateAutoImports(emptyScan(), options);
    const raw = await readFile(second.componentsDtsPath, 'utf8');

    expect(raw).toContain("    Card: typeof import('./../src/components/card.vue')['default']");
    expect(raw).not.toContain('old/card.vue');
  });

  it('文件不存在 / 内容无法解析时不抛错，只写本次扫描结果', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-missing-'));
    const options = { cwd, srcDir: resolve(cwd, 'src'), buildDir: '.ubean' };

    // 目录/文件都不存在 —— 必须照常产出（dev 首次启动就是这个状态）
    const result = await generateAutoImports(emptyScan(), options);
    const raw = await readFile(result.componentsDtsPath, 'utf8');
    expect(raw).toContain("    Link: typeof import('ubean/client')['Link']");

    // 乱码内容也不能炸
    await writeFile(result.componentsDtsPath, 'not a d.ts at all\n  ??? : typeof\n', 'utf-8');
    const again = await generateAutoImports(emptyScan(), options);
    const raw2 = await readFile(again.componentsDtsPath, 'utf8');
    expect(raw2).toContain("    Link: typeof import('ubean/client')['Link']");
  });

  /**
   * `.server.vue` / `.client.vue` 是组件半成品，不是独立组件（见 `COMPONENT_HALF_GLOBS`）。
   *
   * 缺陷形态：按文件名派生名字会得到 `Foo.server` / `Foo.client`，写进 `components.d.ts`
   * 就是**非法 TypeScript** —— 未加引号的带点键在接口里是限定名（TS1131），而语法错误
   * 不受文件顶部 `@ts-nocheck` 影响，于是整个示例项目的 `pnpm type-check` 直接红。
   * unplugin-vue-components 重写同一份文件时同样会产出非法行（`const 'Foo.server': …`），
   * 所以两侧都要排除：这里守 codegen 侧，unplugin 侧由 `globsExclude` 接线（vue-plugin.ts）。
   */
  it('不把 .server.vue / .client.vue 当成组件（否则写出非法 TS 键）', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-halves-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'Paired.server.vue'), '<template><b class="paired-server" /></template>');
    await writeFile(join(componentsDir, 'Paired.client.vue'), '<template><b class="paired-client" /></template>');
    await writeFile(join(componentsDir, 'Solo.client.vue'), '<template><b /></template>');
    await writeFile(join(componentsDir, 'plain.vue'), '<template><i /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.componentsDtsPath, 'utf8');

    // 半成品一律不出现（成对与单边都一样）
    for (const leaked of ['Paired.server', 'Paired.client', 'Solo.client']) {
      expect(raw, `组件半成品泄漏进 d.ts: ${leaked}`).not.toContain(`    ${leaked}:`);
    }
    // 普通组件照常收录
    expect(raw).toContain('    Plain: typeof import(');

    // 任何键都必须是合法 TS —— 非标识符名要加引号，否则语法错误会连累整个项目
    const keyLines = raw.split('\n').filter(line => /^ {4}\S.*: typeof /.test(line));
    expect(keyLines.length).toBeGreaterThan(0);
    for (const line of keyLines) {
      expect(line, `d.ts 键不是合法 TS: ${line}`).toMatch(/^ {4}(?:[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"): typeof /);
    }
  });

  it('名字含点（普通文件名）时加引号，不产出限定名键', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-dotted-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'My.Comp.vue'), '<template><i /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.componentsDtsPath, 'utf8');

    // 名字要与 unplugin 的派生结果一致（两个写入器不能各写各的），但必须是合法键
    expect(raw).toContain('    "My.Comp": typeof import(');
    expect(raw).not.toContain('    My.Comp: typeof import(');
  });

  /**
   * 虚拟组件（配对 / 单边 `.server.vue` / `.client.vue` 的基名）需要 ambient 声明。
   *
   * 缺陷形态：`import ThemeBadge from '../components/sc/ThemeBadge.vue'` 在磁盘上没有对应文件
   * （由 `@ubean/islands` 的 `resolveId` 合成），于是 TS 报 `Cannot find module …`。声明必须
   * 写在**非模块**文件里：`export {}` 会让 `declare module '*X.vue'` 退化成「模块增强」，
   * 声明随即失效（实测如此，所以这条断言同时守着「没有 `export {}`」）。
   *
   * 超时预算 30s：本机 ~0.2s，windows-latest / Node 22 上报过 `Test timed out in 5000ms`
   * （CI run 39401592189）—— 临时目录 + 磁盘读写 + 文件扫描，Windows runner 的 fs 比
   * ubuntu 慢一个量级。超时是唯一失败模式，断言照常兜住。
   */
  it('为配对/单边组件生成可用的 ambient 声明', { timeout: 30_000 }, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'ubean-codegen-virtual-'));
    const componentsDir = join(cwd, 'src/components');
    await mkdir(componentsDir, { recursive: true });
    await writeFile(join(componentsDir, 'theme-badge.server.vue'), '<template><b class="s" /></template>');
    await writeFile(join(componentsDir, 'theme-badge.client.vue'), '<template><b class="c" /></template>');
    await writeFile(join(componentsDir, 'solo.client.vue'), '<template><b /></template>');
    // 同名真实文件也在：TS 自己能解析，不该再生成声明（否则是死代码）
    await writeFile(join(componentsDir, 'plain.vue'), '<template><i /></template>');
    await writeFile(join(componentsDir, 'plain.server.vue'), '<template><i class="s" /></template>');

    const result = await generateAutoImports(emptyScan(), {
      cwd,
      srcDir: resolve(cwd, 'src'),
      buildDir: '.ubean'
    });
    const raw = await readFile(result.virtualComponentsDtsPath, 'utf8');

    // 通配说明符用**文件名基名**（导入里写的就是它），不是 PascalCase。
    // 单边的 `solo.client.vue` → 虚拟基名是 `solo`（用户导入 `solo.vue`，由插件指向该半边）
    expect(raw).toContain("declare module '*theme-badge.vue'");
    expect(raw).toContain("declare module '*solo.vue'");
    // 配对取服务端变体；单边 .client 取客户端变体
    expect(raw).toContain("typeof import('./../src/components/theme-badge.server.vue')['default']");
    expect(raw).toContain("typeof import('./../src/components/solo.client.vue')['default']");
    // 真实文件存在 → 不生成
    expect(raw).not.toContain('*plain.vue');
    // 非模块：出现 `export {}` 会让 declare module 退化成模块增强
    expect(raw).not.toContain('export {}');
  });
});
