/**
 * `ubean:env/*` 虚拟模块与「客户端不得 import 服务端 env」护栏。
 *
 * 分三层：
 * 1. **纯函数**（`resolveEnvModules`）—— 维度规范化、`client+secret` 配置期抛错、类型渲染
 * 2. **渲染产物**—— 生成的源码字符串里真的内联了字面量 / 真的带 `throw`
 * 3. **真实构建**（两层）—— 同一条护栏必须在 `vite build` 里真的让构建失败，而不只是
 *    在纯函数层面看着对。第 3 层才是这次改动的核心承诺（「构建期失败，不是运行时报错」），
 *    前两层只是更便宜的定位工具。
 *
 * 为什么不在第 3 层里用 `source.includes()` 断言护栏存在：那是假契约（TS-26 连踩三次）。
 * 这里跑真构建，判据是「构建命令的退出行为」。
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { loadUbeanConfig } from '@ubean/config';
import { renderEnvClientModule, renderEnvServerModule, resolveEnvModules } from '../src/env/types';
import { ubeanEnvPlugin } from '../src/env/plugin';
import { generateEnvTypes } from '../src/env/codegen';

let roots: string[] = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

/* -------------------------------------------------------------------------- */
/* 1. 纯函数层                                                                 */
/* -------------------------------------------------------------------------- */

const meta = (extra: Record<string, unknown>) => ({ __ubeanEnvField: true as const, ...extra });

describe('resolveEnvModules 维度规范化', () => {
  it('按 context 分流到两个模块，client 值取 import.meta.env', () => {
    const modules = resolveEnvModules({
      schema: {
        APP_TITLE: meta({ type: 'string', context: 'client', access: 'public', default: 'fallback' }),
        JWT_SECRET: meta({ type: 'string', context: 'server', access: 'secret', default: 'dev' }),
        PORT: meta({ type: 'number', context: 'server', access: 'public', default: 9527 })
      },
      importMetaEnv: { APP_TITLE: 'Real Title' }
    });

    expect(modules.client.map(f => f.key)).toEqual(['APP_TITLE']);
    expect(modules.client[0]?.value).toBe('Real Title');
    expect(modules.server.map(f => f.key)).toEqual(['JWT_SECRET', 'PORT']);
    // 服务端的**真实**取值在运行期（读 `process.env`），归一化阶段只把 `default`
    // 作为回退值备好 —— 生成代码在 `process.env` 里没值时用它。
    expect(modules.server[0]?.value).toBe('dev');
    expect(modules.server[1]?.value).toBe(9527);
  });

  it('server 字段缺值时回退 `default`，而不是报 Missing required env', () => {
    const modules = resolveEnvModules({
      schema: {
        WITH_DEFAULT: meta({ type: 'string', context: 'server', access: 'secret', default: 'fallback-secret' }),
        NO_DEFAULT: meta({ type: 'string', context: 'server', access: 'secret' })
      },
      serverEnv: {}
    });

    const code = renderEnvServerModule(modules.server);

    // 生成的代码里带上了回退值
    expect(code).toContain('"default":"fallback-secret"');
    // 没有 default 的字段不带 default 键（`JSON.stringify` 丢 undefined）
    expect(code).not.toContain('"key":"NO_DEFAULT","type":"string","optional":false,"default"');
  });

  it('server 字段有 `default` 时不算 optional；只有显式 optional 才算', () => {
    const modules = resolveEnvModules({
      schema: {
        HAS_DEFAULT: meta({ type: 'string', context: 'server', access: 'secret', default: 'x' }),
        EXPLICIT_OPTIONAL: meta({ type: 'string', context: 'server', access: 'secret', optional: true }),
        NEITHER: meta({ type: 'string', context: 'server', access: 'secret' })
      },
      serverEnv: {}
    });

    const byKey = new Map(modules.server.map(f => [f.key, f]));
    expect(byKey.get('HAS_DEFAULT')?.optional).toBe(false);
    expect(byKey.get('EXPLICIT_OPTIONAL')?.optional).toBe(true);
    expect(byKey.get('NEITHER')?.optional).toBe(true);
  });

  it('client 值缺失时回落 default，仍缺则留 undefined', () => {
    const modules = resolveEnvModules({
      schema: {
        WITH_DEFAULT: meta({ type: 'string', context: 'client', access: 'public', default: '/api' }),
        NO_DEFAULT: meta({ type: 'string', context: 'client', access: 'public' })
      },
      importMetaEnv: {}
    });

    expect(modules.client.find(f => f.key === 'WITH_DEFAULT')?.value).toBe('/api');
    expect(modules.client.find(f => f.key === 'NO_DEFAULT')?.value).toBeUndefined();
  });

  it('client 值回落 `.env` 原始内容（无 `VITE_` 前缀的 key 不在 import.meta.env 里）', () => {
    const modules = resolveEnvModules({
      schema: {
        APP_TITLE: meta({ type: 'string', context: 'client', access: 'public' }),
        API_PREFIX: meta({ type: 'string', context: 'client', access: 'public', default: '/api' })
      },
      importMetaEnv: { APP_TITLE: 'FromVite' },
      dotEnv: { APP_TITLE: 'FromDotEnv', API_PREFIX: '/api/v2' }
    });

    // 两者都在时 import.meta.env 胜（构建期派生值优先）
    expect(modules.client.find(f => f.key === 'APP_TITLE')?.value).toBe('FromVite');
    // 只在 .env 里时用 .env
    expect(modules.client.find(f => f.key === 'API_PREFIX')?.value).toBe('/api/v2');
  });

  it('client + secret 在配置期就抛错（不该等到构建）', () => {
    expect(() =>
      resolveEnvModules({
        schema: { LEAKED: meta({ type: 'string', context: 'client', access: 'secret' }) },
        importMetaEnv: {}
      })
    ).toThrow(/cannot be combined with access 'secret'/);
  });

  it('服务端字段：有 default 就不算 optional，缺值且无 default 才算', () => {
    const modules = resolveEnvModules({
      schema: {
        WITH_DEFAULT: meta({ type: 'string', context: 'server', access: 'secret', default: 'dev' }),
        NEEDED: meta({ type: 'string', context: 'server', access: 'secret' }),
        OPT_IN: meta({ type: 'string', context: 'server', access: 'secret', optional: true })
      },
      serverEnv: {}
    });

    expect(modules.server.find(f => f.key === 'WITH_DEFAULT')?.optional).toBe(false);
    expect(modules.server.find(f => f.key === 'NEEDED')?.optional).toBe(true);
    expect(modules.server.find(f => f.key === 'OPT_IN')?.optional).toBe(true);
  });

  it('enum 字段的 TypeScript 类型是字面量联合', () => {
    const modules = resolveEnvModules({
      schema: {
        API_ENV: meta({ type: 'enum', values: ['local', 'dev', 'prod'], context: 'client', access: 'public' })
      },
      importMetaEnv: {}
    });
    expect(modules.client[0]?.type).toBe('"local" | "dev" | "prod"');
  });
});

/* -------------------------------------------------------------------------- */
/* 2. 渲染产物层                                                               */
/* -------------------------------------------------------------------------- */

describe('虚拟模块渲染', () => {
  it('客户端模块把值内联成字面量，缺值的导出 undefined', () => {
    const source = renderEnvClientModule(
      resolveEnvModules({
        schema: {
          APP_TITLE: meta({ type: 'string', context: 'client', access: 'public' }),
          API_PREFIX: meta({ type: 'string', context: 'client', access: 'public' })
        },
        importMetaEnv: { APP_TITLE: 'SoybeanAdmin' }
      }).client
    );

    expect(source).toContain('export const APP_TITLE = "SoybeanAdmin";');
    expect(source).toContain('export const API_PREFIX = undefined;');
  });

  it("mode: 'throw' 时生成的服务端模块在 import 期就抛", () => {
    const source = renderEnvServerModule(
      resolveEnvModules({
        schema: { JWT_SECRET: meta({ type: 'string', context: 'server', access: 'secret' }) },
        serverEnv: {}
      }).server,
      'throw'
    );

    expect(source).toContain('throw new Error(message)');
    expect(source).toContain('process.env');
  });

  it("mode: 'warn'（默认）不阻断启动；'throw' 才把校验失败升级成异常", () => {
    // 模板里 `throw` 那一行总是存在（在同一段代码里分派），所以判据必须是**注入的 mode 字面量**
    // —— 断言「源码里没有 throw 字样」会永远失败。
    expect(renderEnvServerModule([], 'throw')).toContain('if ("throw" === \'throw\')');
    expect(renderEnvServerModule([], 'warn')).toContain('if ("warn" === \'throw\')');
  });
});

/* -------------------------------------------------------------------------- */
/* 3. 真实构建层                                                               */
/* -------------------------------------------------------------------------- */

interface Fixture {
  root: string;
  /** 写一个入口文件并返回它的相对路径。 */
  writeEntry: (name: string, code: string) => void;
}

/** 建一个最小可构建项目（index.html + 入口 + 带 env.schema 的 ubean.config.ts）。 */
async function createFixture(dotEnv?: string): Promise<Fixture> {
  const root = mkdtempSync(join(tmpdir(), 'ubean-env-plugin-'));
  roots.push(root);

  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'env-fixture', type: 'module' }));
  if (dotEnv !== undefined) writeFileSync(join(root, '.env'), dotEnv);
  writeFileSync(join(root, 'index.html'), '<div id="app"></div><script type="module" src="/main.ts"></script>');
  writeFileSync(
    join(root, 'ubean.config.ts'),
    `export default {
  env: {
    mode: 'throw',
    schema: {
      APP_TITLE: { __ubeanEnvField: true, type: 'string', context: 'client', access: 'public', default: 'FromSchema' },
      JWT_SECRET: { __ubeanEnvField: true, type: 'string', context: 'server', access: 'secret', default: 'dev-secret' }
    }
  }
};
`
  );

  return {
    root,
    writeEntry: (name, code) => writeFileSync(join(root, name), code)
  };
}

async function runBuild(root: string) {
  const config = await loadUbeanConfig(root);
  return build({
    root,
    configFile: false,
    logLevel: 'silent',
    build: { outDir: 'dist', write: true },
    plugins: [ubeanEnvPlugin({ config })]
  });
}

/** 读 `dist/assets/*.js` 拼起来，用于断言产物里真的有内联值。 */
function readBundle(root: string): string {
  const assets = join(root, 'dist/assets');
  return readdirSync(assets)
    .filter(name => name.endsWith('.js'))
    .map(name => readFileSync(join(assets, name), 'utf8'))
    .join('\n');
}

describe('真实构建：ubean:env/* 的分流与护栏', () => {
  it('客户端可以 import ubean:env/client，值被内联进产物', async () => {
    const { root, writeEntry } = await createFixture();
    writeEntry('main.ts', "import { APP_TITLE } from 'ubean:env/client';\ndocument.title = APP_TITLE;\n");

    await runBuild(root);

    // 判据是产物内容，不是「构建没报错」—— 后者对「模块被解析成空对象」也同样成立。
    expect(readBundle(root)).toContain('FromSchema');
  }, 60_000);

  it('客户端 import ubean:env/server → 构建失败，且报错指出根因', async () => {
    const { root, writeEntry } = await createFixture();
    writeEntry('main.ts', "import { JWT_SECRET } from 'ubean:env/server';\nconsole.log(JWT_SECRET);\n");

    await expect(runBuild(root)).rejects.toThrow(/cannot be imported from client code/);
  }, 60_000);

  it('`.ubean/env.d.ts` 必须是合法 TS：optional 字段写 `| undefined` 而非 `key?:`', async () => {
    // 回归：`export const X?: T` 在 `declare module` 块里是语法错误（TS1005/TS1134），
    // 而它只在真实项目跑 `vue-tsc` 时才会红 —— 插件单测看不到。这条测试把
    // 「生成的声明能被解析」钉在单测层。
    const outDir = mkdtempSync(join(tmpdir(), 'ubean-env-types-'));
    roots.push(outDir);

    const outPath = await generateEnvTypes({
      outDir,
      modules: {
        client: [{ key: 'APP_TITLE', type: 'string', optional: false }],
        server: [
          { key: 'PORT', type: 'number', optional: false },
          { key: 'REDIS_URL', type: 'string', optional: true }
        ]
      },
      importMetaEnv: { MODE: 'test', DEV: true, PROD: false, BASE_URL: '/', VITE_X: 'y' }
    });

    const contents = readFileSync(outPath, 'utf8');
    expect(contents).toContain('export const REDIS_URL: string | undefined;');
    expect(contents).not.toContain('REDIS_URL?:');
    // 语法有效性：TypeScript 能把它当声明文件解析（有语法错会抛 Diagnostic）。
    const ts = await import('typescript');
    const source = ts.createSourceFile('env.d.ts', contents, ts.ScriptTarget.ESNext, true);
    // @ts-expect-error 访问内部诊断容器 —— 公开 API 不暴露 parseDiagnostics
    const diagnostics = source.parseDiagnostics ?? [];
    expect(diagnostics.map(d => `${d.code}:${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`)).toEqual([]);
  });

  it('密钥不泄露：JWT_SECRET 的字面值不出现在客户端产物里', async () => {
    const { root, writeEntry } = await createFixture();
    writeEntry('main.ts', "import { APP_TITLE } from 'ubean:env/client';\ndocument.title = APP_TITLE;\n");

    await runBuild(root);

    expect(readBundle(root)).not.toContain('dev-secret');
  }, 60_000);
});

describe('`.env` → `process.env`（服务端模块的取值前提）', () => {
  afterEach(() => {
    delete process.env.UBEAN_TEST_DOTENV_ONLY;
    delete process.env.UBEAN_TEST_PRECEDENCE;
  });

  it('构建/启动时把 `.env` 合进 process.env，产生的服务端模块才读得到值', async () => {
    const { root, writeEntry } = await createFixture('UBEAN_TEST_DOTENV_ONLY=from-file\n');
    writeEntry('main.ts', "document.title = 'x';\n");

    // 前置断言：不是 Vite 自己放进去的（所以下面的断言真在测插件那一步）。
    // 若某天 Vite 开始把 `.env` 写进 `process.env`，这行会红 —— 那就是该拆掉插件里
    // `loadEnv` 那一段的时候，而不是把断言删掉。
    expect(process.env.UBEAN_TEST_DOTENV_ONLY).toBeUndefined();

    await runBuild(root);

    expect(process.env.UBEAN_TEST_DOTENV_ONLY).toBe('from-file');
  }, 60_000);

  it('真实环境变量压过 `.env`（CI 里的 `JWT_SECRET=… pnpm dev` 不能被仓库文件盖掉）', async () => {
    const { root, writeEntry } = await createFixture('UBEAN_TEST_PRECEDENCE=from-file\n');
    writeEntry('main.ts', "document.title = 'x';\n");
    process.env.UBEAN_TEST_PRECEDENCE = 'from-shell';

    await runBuild(root);

    expect(process.env.UBEAN_TEST_PRECEDENCE).toBe('from-shell');
  }, 60_000);
});
