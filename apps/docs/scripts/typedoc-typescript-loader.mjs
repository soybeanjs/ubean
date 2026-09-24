/**
 * 让 TypeDoc 用上真实的 TypeScript。
 *
 * ## 为什么要这个 loader
 *
 * 根 `pnpm-workspace.yaml` 的 `overrides.typescript: 'catalog:'` 会把工作区里**每一个**
 * `typescript` 说明符都重写成 `typescript-native-bridge`（tsgo 桥）。这条全局 override 是
 * **必需的**：没有它，依赖图里会同时出现 tsgo 与真实 TypeScript 两个实例，vue-router 的
 * 类型从两处解析，`packages/client` 会报
 * `RouteLocationNormalizedLoadedGeneric is not assignable to ...`（实测）。
 *
 * 但 TypeDoc 需要真实 TypeScript：它直接驱动编译器 API，tsgo 桥未实现其中一部分
 * （`declaration.type.getChildAt` 等），表现为 `typedoc exit 6`，7 个包里 5 个只能出存根。
 *
 * 试过且**无效**的路子（都试过，别再重复）：
 *   - `overrides['typedoc>typescript']`（含 `@0.28.20>`、`>typedoc>`、npm alias 各种写法）
 *   - `packageExtensions.typedoc.{dependencies,peerDependencies}`
 *   - 在 `apps/docs` 声明 `typescript: 5.9.3`（peer 仍从依赖树解析）
 *   - 直接给 TypeDoc 打补丁跳过 `getChildAt`（错误只是推迟到下一处编译器 API）
 *
 * 有效的路子是**别名依赖**：`typescript-real: npm:typescript@5.9.3`。包名不是 `typescript`，
 * 全局 override 按名匹配故不会改写它 —— 于是真实 TypeScript 装进了 node_modules，而全图
 * 仍是单实例（tsgo）。TypeDoc 硬编码 `import ts from "typescript"`，所以这里用 loader
 * 把那个裸说明符指到别名包，其余导入一概放过。
 *
 * 与仓库代码零耦合：全仓没有一处运行时代码 `import 'typescript'`（24 个包只用类型），
 * 类型检查仍由各包声明的 tsgo 负责。这个 loader 只服务 `build:api`。
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// 相对本文件解析：loader 位于 apps/docs/scripts/，故从 apps/docs 的依赖上下文找别名包。
const require = createRequire(new URL('../package.json', import.meta.url));

let realTypescriptUrl = null;

try {
  // 真实 TypeScript 的入口（CJS 的 lib/typescript.js）。ESM 侧 `import ts from 'typescript'`
  // 拿到的就是 module.exports，TypeDoc 用的 `ts.SyntaxKind` / `ts.isXxx` 都在上面。
  realTypescriptUrl = pathToFileURL(require.resolve('typescript-real')).href;
} catch {
  // 别名包缺失（未跑 pnpm install，或依赖被改动）。不在这里抛错 —— 让 TypeDoc 自己
  // 报出缺 typescript 的原始错误，比 loader 里抛栈更好定位。
  realTypescriptUrl = null;
}

export async function resolve(specifier, context, nextResolve) {
  if (realTypescriptUrl && (specifier === 'typescript' || specifier.startsWith('typescript/'))) {
    // 只拦裸说明符与其子路径（`typescript/lib/...`）；`typescript-real` 这类不受影响。
    if (specifier === 'typescript') {
      return { url: realTypescriptUrl, shortCircuit: true };
    }
  }

  return nextResolve(specifier, context);
}
