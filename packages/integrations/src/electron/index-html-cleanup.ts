/**
 * 清掉 `vite-plugin-electron` 写在项目根目录的 mock `index.html`。
 *
 * 背景：`vite-plugin-electron` 的 dev 插件在 `configResolved` 里调 `resolveInput(config)`，
 * 它只认三样东西 —— `config.build.rollupOptions.input`、`config.build.lib`、根目录已存在的
 * `index.html`。ubean 三者都不给：入口是**按环境**声明的
 * （`environments.client.build.rollupOptions.input`，见 `@ubean/build` 的
 * `createBuildEnvironments()`），dev 下客户端入口还是虚拟模块
 * `virtual:ubean-client-entry`，根目录也刻意没有 `index.html`。
 *
 * 于是每次 `ubean dev` 都会在项目根写一个 `index.html`（内容是一段 electron renderer 的
 * 占位 HTML）。**这个文件从来没被用上**：`GET /` 由 ubean 的 SSR 管道处理，
 * `GET /index.html` 返回 404，electron 主进程加载的是 dev server URL。
 * 但它是**静默**的 —— 插件自己打的 `No entry found, writing mock ...` 被 ubean 的日志闸门
 * 归入信息类输出（默认隐藏），用户只会在 `git status` 里看见一个陌生文件。
 *
 * 清理时机必须自己管：插件把清理函数挂在 `httpServer.once('close')` 上，只有走优雅退出
 * （Ctrl+C 的 SIGINT、SIGTERM）才会执行。被硬杀（SIGKILL、崩溃、IDE 停任务）时那份
 * 178 字节的占位文件就留在工作区里，而且它是同一个 mock，所以下次 dev 会被反复「续命」。
 *
 * 本插件在 `configResolved` 里删 —— 此刻 `vite-plugin-electron` 已经写完（它的
 * `configResolved` 与注册顺序在同一批里、先于本插件的 `configResolved` 执行），删掉后
 * 剩下的整个 dev 生命周期都不需要这个文件。并且只在**内容等于官方 mock** 时删，
 * 用户手写的 `index.html` 一根汗毛都不碰。若 ubean 将来自己在根目录放了
 * `index.html`（真入口），内容不等，同样不会被误删。
 */
import type { Plugin } from 'vite';

/**
 * `vite-plugin-electron` 的 `MOCK_INDEX_HTML` 的副本，逐字节一致。
 *
 * 不能从包里 import —— 它只作为模块内的局部常量存在（未导出），所以这里复制一份。
 * 比对用**内容相等**而非文件名，这样用户自己的 `index.html` 永远不会被删。
 */
export const VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <title>vite-plugin-electron</title>
  </head>
  <body>
    <div>An entry file for electron renderer process.</div>
  </body>
</html>`;

/** 本插件名，便于在 Vite 插件列表里识别。 */
export const ELECTRON_INDEX_CLEANUP_PLUGIN_NAME = 'ubean:electron:index-html-cleanup';

/** 该 mock 的标题特征（内容比对之外的第二道判据，避免只差一个换行就漏掉）。 */
const MOCK_MARKERS = ['vite-plugin-electron', 'An entry file for electron renderer process.'] as const;

/**
 * 内容是否就是 `vite-plugin-electron` 的残留 mock。
 *
 * 完全相等时立即为真；否则要求两个标记串都在，用来兜住换行/尾随空白的差异。
 */
export function isVitePluginElectronMock(content: string): boolean {
  if (content === VITE_PLUGIN_ELECTRON_MOCK_INDEX_HTML) return true;
  return MOCK_MARKERS.every(marker => content.includes(marker));
}

/**
 * 创建清理插件。
 *
 * 只在 `serve`（dev）下生效 —— `build` 路径没有这个 mock（`closeBundle` 会删，且
 * `resolveInput` 在产物构建里拿到的是真实的 `environments` 入口）。
 */
export function createElectronIndexHtmlCleanupPlugin(): Plugin {
  return {
    name: ELECTRON_INDEX_CLEANUP_PLUGIN_NAME,
    apply: 'serve',
    async configResolved(config) {
      const { unlink, readFile, rm } = await import('node:fs/promises');
      const { join } = await import('node:path');

      const mockPath = join(config.root, 'index.html');

      let content: string;
      try {
        content = await readFile(mockPath, 'utf-8');
      } catch {
        // 没有该文件 —— `vite-plugin-electron` 这次没写（未来修好了，或配置给了 input）
        return;
      }

      if (!isVitePluginElectronMock(content)) return;

      await unlink(mockPath).catch(() => rm(mockPath, { force: true }));
      config.logger.info(
        `[ubean] 已清掉 vite-plugin-electron 写下的占位 index.html（${mockPath}）—— ` +
          `它不是 ubean 的入口，删掉不影响 dev server`
      );
    }
  };
}
