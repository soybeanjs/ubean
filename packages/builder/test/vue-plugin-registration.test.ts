/**
 * 历史事故 #1（RM-V14）—— `.vue` 被 `@vitejs/plugin-vue` 编译两次，`ubean build` 直接失败。
 *
 * 事故现场（commit `5a957c4` 的 message 是原始记录）：RM-V14 把 `@vitejs/plugin-vue` 的
 * 所有权移进 `ubeanVite` 后，**dev 路径**同步去掉了重复注册，**build 路径漏改** ——
 * 于是 `.vue` 被编译两次，第二个实例拿到已编译成 JS 的代码，报
 * `At least one <template> or <script> is required`。
 *
 * 为什么漏检：dev 侧有 500+ 断言，example 的 783 条测的是运行时 API，`prerender` 测试直接
 * 调 `prerender()` 而不是完整构建；只有 `analyze:check` 会跑 `ubean build`，而它不在那轮的
 * 验证清单里。**共同模式是「dev 侧有断言、build/产物侧 0 断言」**，且失败只在真正构建时出现。
 *
 * `production-build.test.ts` 用一次真实构建补上了那条端到端断言（代价是秒级），但它是
 * **集成测试**：只能告诉你「整体坏了」，不能告诉你「谁多注册了一份 vue 插件」，而且在
 * fixture 缺少用户 `vite.config` 的那一支才走得到 —— 生产路径的常见形态是
 * **有** 用户 `vite.config.ts`（`ubeanPlugin()` 在里面），那条分支此前无人覆盖。
 *
 * 所以这里补的是**结构性判据**（毫秒级、不跑构建），把「插件集合里 `vite:vue` 恰好一份」
 * 直接钉在装配结果上 —— 这正是事故的充分必要条件：多一份 = 重复编译，少一份 = `.vue` 报
 * “Install @vitejs/plugin-vue”。
 *
 * 断言的是**装配结果**（插件对象数组的 name），不是「代码里有没有 `vue(` 调用」——
 * 后者是 `source.includes()` 式的假契约（TS-26 连踩三次的坑）。
 */
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadUbeanConfig } from '@ubean/config';
import { ubeanPlugin as ubeanCorePlugin } from '../src/vite';
import { ubeanVite } from '../src/vue-plugin';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/build-project');

/** `@vitejs/plugin-vue` 注册的插件 name（Vite 官方插件名，稳定）。 */
const VUE_PLUGIN_NAME = 'vite:vue';

type NamedPlugin = { name?: string };

/** 摊平插件数组（`ubeanPlugin` 返回单个 Plugin，`ubeanVite` 返回数组，两种都要能吃）后取 name。 */
const names = (plugins: unknown[]): string[] =>
  plugins.flat(Number.POSITIVE_INFINITY).map(plugin => (plugin as NamedPlugin)?.name ?? '<unnamed>');

/** 数「插件集合里有几份 vue」—— 传入的是 `names()` 的结果。 */
const countVuePlugins = (pluginNames: string[]): number => pluginNames.filter(name => name === VUE_PLUGIN_NAME).length;

describe('vue 插件的唯一注册（RM-V14）', () => {
  it('核心插件不带 vue，Vue 专属插件恰好带一份', async () => {
    const config = await loadUbeanConfig(FIXTURE);

    const corePlugins = names([ubeanCorePlugin({ config })]);
    const vuePlugins = names(ubeanVite({ config }));

    // 核心插件是框架无关的：它一旦带上 vue，用户的 `ubeanPlugin()`（core + vue）就会出现两份。
    expect(countVuePlugins(corePlugins), `核心插件不应注册 vue，实际插件：${corePlugins.join(', ')}`).toBe(0);
    // 恰好一份：0 份 → `.vue` 无法编译（RM-V14 之前的 dev 症状）；2 份 → 重复编译（本次事故）。
    expect(countVuePlugins(vuePlugins), `ubeanVite 应注册恰好一份 vue，实际插件：${vuePlugins.join(', ')}`).toBe(1);
    expect(vuePlugins).toContain(VUE_PLUGIN_NAME);
  });

  it('`vue: false` 是显式逃生口，且只关掉 vue（其余虚拟模块仍在）', async () => {
    const config = await loadUbeanConfig(FIXTURE);

    const withVue = names(ubeanVite({ config }));
    const withoutVue = names(ubeanVite({ config, vue: false }));

    expect(countVuePlugins(withoutVue)).toBe(0);
    // 逃生口必须**只**关 vue：`ubeanVite` 同时提供 `virtual:ubean-pages` / `virtual:ubean-app`
    // 等虚拟模块，整包消失会让页面路由与入口一起坏掉。差异应当恰好是一个插件。
    expect(withVue.length - withoutVue.length).toBe(1);
    expect(withoutVue).toContain('ubean:vue');
  });

  it('合并「核心 + Vue」两条装配路径后仍是恰好一份（事故的真实形态）', async () => {
    const config = await loadUbeanConfig(FIXTURE);

    // 生产构建的插件集合 = `ubeanPlugin()`（用户 vite.config）+ 可选的 builtin 补位。
    // 事故就是这两条路径各带一份 vue；这里直接把合并结果数出来。
    const merged = names([ubeanCorePlugin({ config }), ...ubeanVite({ config })]);

    expect(countVuePlugins(merged), `合并后 vue 插件数应为 1，实际：${merged.join(', ')}`).toBe(1);
    // 探针自证：把同一份再合并一次就会变成 2 —— 即事故形状。
    const doubled = names([ubeanCorePlugin({ config }), ...ubeanVite({ config }), ...ubeanVite({ config })]);
    expect(countVuePlugins(doubled)).toBe(2);
  });
});
