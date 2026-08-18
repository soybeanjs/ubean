/**
 * ubean/client — 一等客户端入口(re-export `@ubean/client` 内核)。
 *
 * 面向两类消费者:
 * 1. 框架虚拟模块(`virtual:ubean-app` 等)的统一导入点;
 * 2. 用户客户端代码(`import { useI18n } from 'ubean/client'`)。
 *
 * 相比 `@ubean/client` 包本体,此处额外导出 `createServerHead` ——
 * 框架的 SSR 构建会加载同一份 `virtual:ubean-app` 模块(执行
 * `createSSRApp` 分支),需要服务端 head 工厂。独立 SPA 场景请直接
 * 依赖 `@ubean/client`(不含任何 server 符号)。
 *
 * `ubean/runtime/vue` 子路径保留并 re-export 此处全部导出(兼容别名)。
 */
export * from '@ubean/client';
export { createHead as createServerHead } from '@unhead/vue/server';
