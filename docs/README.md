# ubean 文档

本目录承载 ubean 的架构规划、工程约定与实施路线。核心运行时、文件式路由、Vue SSR、Hono API、i18n、缓存、数据库抽象、存储、队列、Cron、WebSocket、SSE、平台 preset、OpenAPI/Scalar、DevTools 以及 `@ubean/auth`/`@ubean/icon`/`@ubean/pwa` 等扩展包均已实现并附带测试，可参照 [skills/ubean/docs](../skills/ubean/docs) 中的使用指南与 API 参考。下列文档描述设计目标、架构取舍和后续演进方向。

## 阅读导航

| 文档                                   | 内容                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| [项目概览与约定](overview.md)          | 项目定位、参考项目、技术栈、依赖边界和实际目录结构。                    |
| [架构与配置](architecture.md)          | 总体架构、开发/构建数据流、配置系统和应用目录约定。                     |
| [路由设计](routing.md)                 | API 路由、验证、OpenAPI、Pages、layouts、reuse 路由和类型生成。         |
| [运行时与开发体验](runtime.md)         | Vue 应用入口、客户端、定时任务、环境变量、preset、DevTools 与高级能力。 |
| [工程规范、测试与发布](engineering.md) | TypeScript 函数式规范、测试策略、CLI、导出与公开 API 边界。             |
| [路线图与决策](roadmap.md)             | 交付里程碑、实施阶段、参考项目差异、技术决策、风险和任务跟踪。          |
| [生态能力演进](ecosystem.md)           | 元框架调研结论、页面数据协议、可观测性、SEO 与资源/内容扩展的取舍。     |
| [DevTools 迁移设计](devtools-vite-devtools-migration.md) | 基于 Vite DevTools Kit 重构 `@ubean/devtools` 的可行性分析、目标架构与分阶段计划。 |
| [ubean-studio 产品方案](ubean-studio.md) | 基于 Electron 的桌面工作台：DevTools 内嵌、命令可视化、物料市场、商业系统与 AI 驱动的完整规划与任务清单。 |
| [子包拆分方案](subpackage-splitting.md) | monorepo 架构方案：将 `ubean` 拆分为 36 个职责清晰的子包（`@ubean/routing`、`@ubean/api-routes`、`@ubean/runtime`、`@ubean/build` 等），主包 `ubean` 作为聚合器 re-export 全部子包。含路由生成双模式（虚拟 + 实体文件）。 |
| [子包拆分任务清单](subpackage-splitting-tasks.md) | 子包拆分方案的详细任务列表与状态跟踪（49 项任务，8 个阶段）。 |
| [应用模式设计](modes.md)               | 全栈/前端/后端/SSG/SSR 模式设计方案：通过 `ubean.config.ts` 的 `mode` 字段统一声明应用形态，按需执行构建步骤。 |
| [应用模式任务清单](modes-tasks.md)     | 应用模式实施的详细任务列表与状态跟踪（24 项任务，5 个阶段）。 |

## 文档原则

- 架构或公开 API 变更必须同时更新对应主题文档、测试与迁移说明。
- 平台支持以 capability 矩阵和部署 smoke test 为准；未通过验证的平台不能标记为正式支持。
- 新增功能应更新其所属文档，而不是重新集中到单一大型规划文件。
