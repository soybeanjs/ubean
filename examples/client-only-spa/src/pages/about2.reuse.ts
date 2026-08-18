import { definePage } from '@ubean/vue';

/**
 * reuse 路由 —— 纯元数据文件(无组件):
 * 注册 /about2 路由,组件复用目标页 `About`(src/pages/about.vue)。
 * 未显式声明 cache 时继承目标的缓存声明(About cache: true)。
 */
export default definePage({ reuse: 'About' });
