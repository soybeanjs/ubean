import { BasePage } from './base.page';

/**
 * Page object for `/parallel` — 并行路由（P9-18）。
 *
 * `pages/parallel.vue`（默认视图）与 `pages/@aside/parallel.vue`（插槽视图）归入同一条
 * Vue Router 记录（`components: { default, aside }`），默认视图里用
 * `<SlotView name="aside" />` 渲染插槽 —— 而 `@aside/` **不贡献 URL 段**。
 */
export class ParallelPage extends BasePage {
  constructor() {
    super('/parallel');
  }

  async heading(): Promise<string | null> {
    return this.text('.parallel-demo h1');
  }

  async asideHeading(): Promise<string | null> {
    return this.text('.slot-aside h2');
  }
}
