/**
 * @ubean/cli — 库入口
 *
 * 提供给程序化消费的导出(scaffold / fs-ops / templates)。
 *
 * 注意:此入口不调用 `runMain`,不会有 CLI 副作用。
 * CLI 运行入口在 `./cli` 子路径(由 `bin/ubean-next.mjs` 导入)。
 */

// ============== 文件操作工具 ==============
import type { createFsOps } from './shared/fs-ops';

export { createFsOps } from './shared/fs-ops';
export type { FsOpOptions as FsOpsOptions, BackupOptions } from './shared/fs-ops';
export type FsOps = ReturnType<typeof createFsOps>;

// ============== 模板渲染 ==============
export {
  renderTemplate,
  renderPageTemplate,
  renderApiTemplate,
  renderMiddlewareTemplate,
  renderLayoutTemplate,
  renderCronTemplate,
  renderPluginTemplate,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  PAGE_TEMPLATE,
  API_TEMPLATE,
  MIDDLEWARE_TEMPLATE,
  LAYOUT_TEMPLATE,
  CRON_TEMPLATE,
  PLUGIN_TEMPLATE,
  type TemplateVariables,
  type TemplateOptions,
  type PageTemplateData,
  type ApiTemplateData,
  type MiddlewareTemplateData,
  type LayoutTemplateData,
  type CronTemplateData,
  type PluginTemplateData
} from './shared/templates';

// ============== Scaffold API ==============
export {
  scaffold,
  deleteScaffold,
  recoverScaffold,
  listScaffoldableFiles,
  type ScaffoldOptions,
  type ScaffoldResult,
  type ScaffoldType
} from './page';
