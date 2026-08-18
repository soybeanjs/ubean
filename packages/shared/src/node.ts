/**
 * Node-only 子路径入口（'@ubean/shared/node'）。
 *
 * 包含依赖 node:net / node:fs 的工具:
 * - ./port(端口探测:findAvailablePort / waitForPort / isPortReachable)
 * - ./vite-config(vite 配置文件探测:findUserViteConfig)
 *
 * 这些模块不进入浏览器安全的 主入口,避免客户端产物引入 node 内建模块。
 */
export * from './port';
export * from './vite-config';
