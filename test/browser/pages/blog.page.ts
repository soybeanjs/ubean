import { BasePage } from './base.page';

/**
 * Page object for the `blog/[...slug].vue` catch-all route.
 *
 * 路由声明是 `definePage({ path: '/blog/:slug(.*)*' })`，故 `/blog`、`/blog/a`、
 * `/blog/a/b/c` 全部命中同一个组件；`slug` 参数在数组与字符串两种形态间归一为
 * 斜杠分隔字符串。
 */
export class BlogPage extends BasePage {
  constructor(slug: string) {
    super(`/blog/${slug}`);
  }

  async heading(): Promise<string | null> {
    return this.text('h1');
  }
}
