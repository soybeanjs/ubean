import { BasePage } from './base.page';

/**
 * Page object for the `pages/404.vue` preset page.
 *
 * 构造时给一个**必然不存在**的路径，这样走的是真实的未匹配分支（返回 404 状态码 +
 * 渲染该组件），而不是直接访问哨兵路由。
 */
export class NotFoundPage extends BasePage {
  constructor(path = '/this-page-does-not-exist') {
    super(path);
  }

  async heading(): Promise<string | null> {
    return this.text('.not-found h1');
  }

  async message(): Promise<string | null> {
    return this.text('.not-found p');
  }

  async homeLinkText(): Promise<string | null> {
    return this.text('.not-found a[href="/"]');
  }
}
