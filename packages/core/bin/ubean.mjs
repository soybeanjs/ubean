#!/usr/bin/env node
/**
 * @ubean/core CLI binary(文件名:ubean.mjs,命令名:ubean-next)。
 *
 * 此二进制仅作为转发入口,实际命令实现由 `@ubean/cli` 提供。
 * 这样设计的好处:
 *   1. `@ubean/core` 作为聚合器,bin 与 lib 来自同一包,用户安装一个包即可
 *   2. CLI 实现集中在 `@ubean/cli`,便于单独维护与版本管理
 *   3. `packages/ubean/bin/ubean.mjs` 通过 `import '@ubean/core/bin/ubean.mjs'` 转发至此
 *
 * `@ubean/cli/cli` 入口在模块顶层调用 `runMain(main)`,import 即触发 CLI 运行。
 *
 * 注意:命令名保持 `ubean-next`(避免与 `ubean` 主包的 `ubean` 命令冲突)。
 * Phase 7 后,用户通过 `ubean` 命令(来自 `ubean` 包)使用 CLI;
 * 直接使用 `@ubean/core` 的用户可通过 `ubean-next` 命令使用。
 */
import '@ubean/cli/cli';
