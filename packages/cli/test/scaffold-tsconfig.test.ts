/**
 * 脚手架写出的 `tsconfig.json` / `package.json` 必须让**生成出来的项目**能通过
 * `vue-tsc --noEmit`。
 *
 * 两个坑都是实测踩出来的（项目：soybean-agent，ubean 0.6.0）：
 *
 * 1. **`.ubean/` 不在 `include` 里 → 一片 TS2307**。
 *   编译器默认 include 是所有文件，但它**排除点开头的目录**。于是
 *    `.ubean/openapi.d.ts`（`src/request/*` 的 import 目标）与
 *    `.ubean/typed-router.d.ts`（`RouteRecordInfo` 模块增强的载体）对 typecheck
 *    完全不可见，用户看到的是「`import type { paths } from '../../.ubean/openapi'`
 *    报 TS2307」和「typed-router 的类型不生效」，而两处都猜不到是 tsconfig 少了一行。
 *    这也解释了为什么仓库内所有 example 都正常：它们的 tsconfig 有 `skipLibCheck: true`
 *    且 `.ubean/` 恰好没被 include —— 覆盖不到的盲区。
 *
 * 2. **`@valibot/to-json-schema` 缺失 → `openapi.d.ts` 根本不生成**。
 *    `hono-openapi` 经 `@standard-community/standard-json` 做标准 Schema → JSON Schema
 *    转换，该包把 `@valibot/to-json-schema` 声明为 **optional peer**；项目只装 `valibot`
 *    时 pnpm 不会自动带出它，`/_openapi.json` 直接 500
 *    （`standard-json: Missing dependencies "@valibot/to-json-schema"`），
 *    于是 `.ubean/openapi.d.ts` 不存在，又是一片 TS2307。
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'pathe';
import { createFsOps } from '../src/shared/fs-ops';
import { scaffoldUnifyTemplate } from '../src/shared/unify-template';

const tempDirs: string[] = [];

function scaffold(): { root: string; read: (p: string) => string } {
  const root = mkdtempSync(join(tmpdir(), 'ubean-scaffold-tsconfig-'));
  tempDirs.push(root);
  return { root, read: (p: string) => readFileSync(join(root, p), 'utf8') };
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('脚手架 tsconfig.json', () => {
  it('include 显式带上 .ubean/**，否则点开头目录被默认规则排除', async () => {
    const { root, read } = scaffold();
    await scaffoldUnifyTemplate(createFsOps(root) as never, {
      name: 'demo',
      preset: 'node',
      packageManager: 'pnpm'
    });

    const raw = read('tsconfig.json');
    // 注释写法是刻意的：JSONC 里注释是给「打开文件照抄配置的人」看的
    const tsconfig = JSON.parse(raw.replace(/^\s*\/\/.*$/gm, '')) as { include: string[] };

    expect(tsconfig.include).toContain('src/**/*');
    expect(tsconfig.include).toContain('.ubean/**/*');
  });

  it('package.json 声明 @valibot/to-json-schema（optional peer，不声明就不会被安装）', async () => {
    const { root, read } = scaffold();
    await scaffoldUnifyTemplate(createFsOps(root) as never, {
      name: 'demo',
      preset: 'node',
      packageManager: 'pnpm'
    });

    const pkg = JSON.parse(read('package.json')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    // 放 devDependencies 即可：`/_openapi.json` 的 spec 生成只发生在 dev / build 期
    expect(pkg.devDependencies?.['@valibot/to-json-schema']).toBeTruthy();
    // 校验器本身是运行时依赖，两个都要在
    expect(pkg.dependencies?.valibot).toBeTruthy();
  });
});
