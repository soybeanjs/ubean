/**
 * CLI flag 与配置文件的三级回落守卫（2026-10 的调查遗留缺陷）。
 *
 * 缺陷形态统一是**同一个**：citty 的 `default: false` / `default: true` 让 `args.x` 永不为
 * `undefined`，于是 `?? config.x` / `|| config.x` 永远读不到配置文件。表现为「配置里写了，
 * 但只有 CLI flag 有效」—— 没有报错、没有警告，问题只能靠读源码发现。
 *
 * 修法是把 citty 参数声明里的 `default` 去掉，取值统一 `args.x ?? config.x ?? fallback`。
 * 这里断言的是**声明本身**（参数 schema 里不该再出现 default），因为端口的实际监听要起完整的
 * dev/preview 进程，那类断言在 `dev-topology` / `preview-cli` 里已经覆盖了行为面。
 */
import { describe, expect, it } from 'vitest';
import { buildCommand } from '../src/build';
import { devCommand } from '../src/dev';
import { previewCommand } from '../src/preview';

/** citty 的参数声明是 `{ type, description, default? }` 对象的字典。 */
type ArgDecls = Record<string, { type: unknown; default?: unknown }>;

function argsOf(command: { args?: unknown }): ArgDecls {
  return (command.args ?? {}) as ArgDecls;
}

describe('citty 参数不带 default，让配置文件有机会生效', () => {
  /**
   * `dev.strictPort` / `dev.open`：这两个字段以前在 `UbeanConfig` 里根本不存在（`open` 存在但
   * 无人读），citty 侧又带 `default: false` —— 配置与 flag 两条路都走不通。
   */
  it('dev: strictPort / open 不声明 default', () => {
    const args = argsOf(devCommand);
    expect(args.strictPort, 'dev 应有 --strictPort 参数').toBeDefined();
    expect(args.strictPort.default, 'dev --strictPort 不能带 default').toBeUndefined();
    expect(args.open, 'dev 应有 --open 参数').toBeDefined();
    expect(args.open.default, 'dev --open 不能带 default').toBeUndefined();
  });

  /**
   * `preview.strictPort`：以前 `args.strictPort ?? config.preview.strictPort` 恒取到 citty 的
   * `false`，于是 `ubean.config.ts` 里的 `preview.strictPort: true` 是死字段。
   */
  it('preview: strictPort 不声明 default', () => {
    const args = argsOf(previewCommand);
    expect(args.strictPort).toBeDefined();
    expect(args.strictPort.default, 'preview --strictPort 不能带 default').toBeUndefined();
  });

  /**
   * `build.minify` / `build.sourcemap`：citty 的 default（true / false）让配置文件永远生效不了，
   * 而 `vite build` 路径那边又是硬编码 —— 两条路径都要能回落到配置。
   */
  it('build: minify / sourcemap 不声明 default', () => {
    const args = argsOf(buildCommand);
    expect(args.minify).toBeDefined();
    expect(args.minify.default, 'build --minify 不能带 default').toBeUndefined();
    expect(args.sourcemap).toBeDefined();
    expect(args.sourcemap.default, 'build --sourcemap 不能带 default').toBeUndefined();
  });

  /**
   * 反例守卫：`cwd` 这类**不该**回落到配置的参数要保留 default。
   * 否则上面几条断言可以靠「把所有 default 都删掉」作弊通过。
   */
  it('不该回落的参数仍保留 default（防止上面几条被「全删 default」作弊通过）', () => {
    expect(argsOf(devCommand).cwd.default).toBe('.');
    expect(argsOf(previewCommand).cwd.default).toBe('.');
  });
});
