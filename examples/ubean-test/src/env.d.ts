/**
 * Ubean 类型扩展示例
 *
 * 通过 TypeScript 模块增强（Module Augmentation）扩展 UbeanVariables 和 UbeanBindings，
 * 这样在 handler 和 middleware 中使用 c.get()、c.set() 时就能获得完整的类型推导。
 */

declare module 'ubean' {
  /**
   * 扩展请求上下文变量（Variables）
   *
   * 这里定义的类型可以通过 c.get('key') 获取，通过 c.set('key', value) 设置
   */
  interface UbeanVariables {
    /** 当前登录用户示例 */
    user?: {
      id: number;
      name: string;
      email: string;
      role: 'admin' | 'user';
    };
  }

  /**
   * 扩展平台绑定（Bindings）
   *
   * 用于 Cloudflare Workers、Deno 等平台传入的环境变量
   */
  interface UbeanBindings {
    // 示例：Cloudflare D1 数据库
    // DB: D1Database;
    // 示例：Cloudflare KV
    // KV: KVNamespace;
  }
}

export {};
