import { BasePage } from './base.page';

/**
 * Page object for `/server-island-props` — Task 9.4 的 props 重渲染服务端岛屿。
 *
 * 页面用 `defineServerIsland(EchoWidget, { rerenderOnPropsChange: true })`，Vite 插件会
 * 自动注入组件绝对路径作为第 3 参数；SSR 端因此把组件注册进进程级注册表，
 * 客户端 `onMounted` 后 `POST /__server-component` 用新 props 重新渲染并替换容器
 * `innerHTML`。
 *
 * 这里**不直接 POST 该端点**（那是 HTTP 语义，L2 的领域）—— 浏览器层要证明的是
 * 「真实浏览器里 props 变化真的换掉了 DOM 内容」。
 */
export class ServerIslandPropsPage extends BasePage {
  constructor() {
    super('/server-island-props');
  }

  /** 切换 `tone` ref（calm ⇄ loud），触发服务端重渲染。 */
  async toggleTone(): Promise<void> {
    await this.click('button.tone-toggle');
  }

  async tone(): Promise<string | null> {
    return this.text('.current-tone');
  }

  async islandText(): Promise<string | null> {
    return this.text('.echo-widget');
  }

  async islandContainerCount(): Promise<number> {
    return this.count('ubean-server-island');
  }

  /**
   * 安装一个 `fetch` 计数器，只统计此后的 `POST /__server-component`。
   *
   * 为什么需要它：props 变化后**客户端 Vue 自己也会重渲染**，DOM 文本因此无论
   * `rerenderOnPropsChange` 开或关都会变成 `loud` —— 只断言 DOM 无法区分
   * 「真的走了服务端一趟」与「纯客户端响应式」。而该 flag 的**全部语义**就是那次 POST，
   * 所以必须把它观测下来。在 `open()` 之后安装（首屏那次 `onMounted` 的请求已发生），
   * 计数器只反映切换 props 触发的请求。
   */
  async installServerComponentRequestCounter(): Promise<void> {
    await this.eval(`
      window.__ts36ServerComponentPosts__ = 0;
      if (!window.__ts36FetchPatched__) {
        window.__ts36FetchPatched__ = true;
        var original = window.fetch;
        window.fetch = function (input, init) {
          var url = typeof input === 'string' ? input : (input && input.url) || '';
          if (String(url).indexOf('/__server-component') !== -1) {
            window.__ts36ServerComponentPosts__ += 1;
          }
          return original.apply(this, arguments);
        };
      }
    `);
  }

  async serverComponentPostCount(): Promise<number> {
    return (await this.eval('return window.__ts36ServerComponentPosts__ || 0')) as number;
  }
}
