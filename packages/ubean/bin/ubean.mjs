#!/usr/bin/env node
/**
 * ubean CLI 二进制(Phase 7 切换后)
 *
 * 直接转发到 `@ubean/cli/cli` 入口(模块顶层调用 `runMain`,import 即触发 CLI 运行)。
 *
 * 命令链:ubean(bin) → @ubean/cli/cli → runMain(main)
 *
 * 注意:`@ubean/core/bin/ubean.mjs` 也转发到同一入口,但通过 `@ubean/core` 包导入。
 * 此处直接导入 `@ubean/cli/cli` 更简洁,且避免 `@ubean/core` exports 字段限制。
 */
import '@ubean/cli/cli';
