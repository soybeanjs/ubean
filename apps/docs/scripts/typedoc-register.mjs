/**
 * `--import` 入口：注册 TypeScript 重定向后再交给 TypeDoc。
 *
 * Node 的 loader 必须经 `module.register()` 注册，而 `--import` 只接受模块路径
 * （不能内联调用），所以本文件做一层注册包装。钩子实现在
 * `typedoc-typescript-loader.mjs`，重定向的原因见该文件顶部注释。
 *
 * 用法（由 scripts/build-api.ts 调用）：
 *   node --import ./scripts/typedoc-register.mjs <typedoc-bin> <args…>
 */
import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

register('./typedoc-typescript-loader.mjs', pathToFileURL(`${import.meta.dirname}/`));
