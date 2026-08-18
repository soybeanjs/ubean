/**
 * 全局组件类型声明。
 *
 * 精简内核不生成 components.d.ts(无构建插件);全局组件
 * (Link / PageView / SlotView)由 `ubeanVue` 插件在运行时注册,
 * 此处手动声明以获得模板类型提示。
 */
export {};

declare module 'vue' {
  export interface GlobalComponents {
    Link: (typeof import('@ubean/vue'))['Link'];
    PageView: (typeof import('@ubean/vue'))['PageView'];
    SlotView: (typeof import('@ubean/vue'))['SlotView'];
  }
}
