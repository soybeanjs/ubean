# 路线图 · 已收口清单与后续入口

> 开发任务型（[ADR-0007](adr/0007-docs-content-classification.md)）。门槛口径见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)；公开选型对比见站点 [framework-comparison](../apps/docs/src/content/zh/architecture/framework-comparison.md)（该矩阵的**唯一维护副本**），本文件不复述对照表。
>
> **评估基线：2026-08-21 快照 —— 该日的规划判断，勿当现状读。** 文中的 `codegraph status` 数字（645 files / 6540 nodes / 24806 edges）同样是该日数字；截至本文件最近一次校对（**887 files / 9,170 nodes / 33,757 edges**）。i18n 已按 [ADR-0009](adr/0009-i18n-engine-and-compact-locale-routing.md) 落地，本周期不回头再造引擎。
>
> **本文件当前没有任何未开始的任务。** 2026 Q4（RM-D01–D08）与 2027 H1（RM-U01–U08）两段 horizon 都已收口，而 2026 Q4 尚未开始 —— 即两段规划被提前用尽。**下一个 horizon 由维护者重新开启**：本文件不发明新任务 ID、不补写新规划。

## 1. 已收口（正文已按 ADR-0007 删除，此处只留指针）

- **2026 Q4 · 还债（RM-D01–D08）**：8/8 ✅。口径与决策见 [ADR-0010](adr/0010-competitive-north-star-and-gap-filter.md)；逐条战报见 git 历史。
- **2027 H1 · 用户可见缺口（RM-U01–U08）**：7/8 ✅；**RM-U03「Nuxt 式客户端 `middleware/*.global` 文件约定」刻意不做** —— 决策与理由已移入 [ADR-0010 补记](adr/0010-competitive-north-star-and-gap-filter.md)。
- **开源侧给 studio 的开口（RM-S01 / RM-S02）**：2/2 ✅。交付物 = [docs/contracts/](contracts/)（scaffold JSON Schema + `.ubean/` codegen 契约）；studio 仍在独立私有仓，本仓不排其里程碑。
- **Vite 插件化（RM-V01–V36）**：已收口。生命周期决策见 [ADR-0012](adr/0012-vite-plugin-first-lifecycle.md)，耐久门禁规格见 [perf-regression-net.md](perf-regression-net.md)。原「性能回归网」逐条战报整体删除：那块内容属迁移过程的逐条流水（原 `vite-plugin-migration.md` 的附录，该文件已按 ADR-0007 删除），且「基线必须在旧路径上冻结」的前提随 RM-V36 落地而永久失效（旧实现已删，无法再测一次）。

## 2. 架构评估（对照源码，不对照营销表）

请求链（`packages/app/src/app.ts` → `registerRoutes` → `packages/routes/src/router.ts` → `packages/client/src/ssr.ts`）：`handle` hook → requestId → ActionContext ALS → securityHeaders → CSRF → dataCache → i18n 中间件 → routeRules+cache → WS → static → 路由 → SSR。这条链是健康的：Hono 一等、页面与 API 同进程、中间件由工厂挂载。

真正的风险不在「功能清单缺一项」，而在**声明的能力宽于默认路径**。已收口的不要再当未做债：

| 现象 | 现状 |
| --- | --- |
| 24 包（含聚合器，即 23 个 `@ubean/*` + `ubean`） | 卫生合并完成（Wave 1+2）；`@ubean/vue` 保持独立。按 `packages/*/package.json` 的 `name` 字段复核 = 24（`ls packages/` 裸目录数不止此数，因为存在未被 git 跟踪的构建残留目录）；该计数由 `scripts/verify-packages.mjs` 守着 |
| 单份 SSR runtime | `ssrSingletonDevPolicy` / `ssrSingletonProdSsr` 共用 |
| `routeRules.rewrite` / `proxy` | 已执行（内部再匹配 / 反向代理） |
| `ppr: true` | 强制流式别名，不是 Next 静态壳 |
| CSRF / security headers / Data Cache | 默认挂载；sessions 仍 opt-in |
| ISR 缓存 | Node 生产 `fs`（`.ubean/cache`）；serverless/edge 仍内存 |
| i18n 消息编译 | 按 locale fingerprint 缓存；不池化 Vue app |
| Islands `data-hydrated` | 已跳过；SPA 导航无 pending 岛时跳过第二帧 rAF（首次 mount 仍强制双 rAF） |
| DB / Queue / Storage 默认内存 | 仍宽于预设能力矩阵；CF / Vercel / Bun sqlite / Deno KV / Netlify Blobs 有非内存示例 |
| SEO `src/sitemap.ts` 等约定 | `registerSeoConventions` 由 `createUbeanApp` 默认调用 |
| 生产 `/_ipx` | `image: true` 时生产 server-entry 挂同一处理器 |
| 生产 `src/crons` | 生产 eager glob；Node/bun/deno 启动 `startCronScheduler`，serverless 不装进程内调度器 |
| 性能验证 | 体积预算进 CI（`analyze:check`，相对 committed 基线 **+5%** 即失败；绝对上限已实现但**默认未启用**）；生命周期基准**刻意不进 CI**（不做阻塞门禁）；dev 服务端热重载曾因 watcher 路径拼接缺陷整体失效（2026-09-15 修复并补回归测试） |

**结论：** 能力面已经够宽（SSR/SSG/ISR/Actions/Islands/`.server.vue`/i18n/OpenAPI/presets）。两段 horizon 的工作都是把「类型里有」收成「默认路径真的做」——这同时服务架构健康（40%）和性能（25%）。

## 3. 不做的伪缺口

- 「把 28 包合成 5 个」——blast radius 过大；卫生包已并入 shared/config/build，不合并 `@ubean/vue`。（原文照录：立项时是 28 包，2026-09 复核为 **24** 包；结论不变。）
- 「默认挂 sessions」——有状态、cookie 密钥，opt-in 正确；只默认 CSRF/headers（RM-D05）。
- 「Next `after()` 再包一层」——已经有 `after()`。
- 「i18n 再加 custom paths / differentDomains」——ADR-0009 明确不做。

## 4. 验收（诚实台账）

1. **已验证**：公开 `framework-comparison.md` 的 ubean 列与源码一致（rewrite / PPR / IPX / 内存存储不再满格）。
2. **已验证**：RM-D01–D08 中 D01、D02、D04、D05 已合并；其余顺延后同样落地，未重新打满营销。
3. **已验证**：RM-U01 + U02 数据层切口与 select SSR（U04）已落地；U03 未另做客户端文件中间件。
4. **仍开放 —— 唯一未验证项**：CodeGraph `impact` 对 `createUbeanApp` / `registerRoutes` / `ubeanPlugin` 在**每一个相关 PR** 留下证据。此条**从未被核查**，没有任何证据表明它真的在 PR 流里执行过。约定正文见站点 `contributing/engineering.md` §10；任务人天不写进本文档。
   - [ ] 逐 PR 核查 `codegraph impact` 证据，或明确废止该约定（维护者决定）。
5. **历史（原文自相矛盾，不再作为验收）**：RM-V01–V36 的原文要求「Phase 1 / Phase 2 各自在灰度开关后独立可发布」，并声称「产物布局与 `analyze:check` 基线全程不变」。前半句随 RM-V36 双轨收敛删除该开关而**不再可执行**；后半句被事实推翻——基线在正确产物上重定过（32 条目 / 111.1 KB），又在审计批次按实测增量（+2.1 kB gzip）刷新过一次。当时真正达成的是：回归网先于 Phase 1 落地，产物契约（而非体积数字）全程有断言。
6. **已完成**：性能回归网的基线曾在**旧实现**上冻结，并因 dev 变更不生效（[perf-regression-net.md](perf-regression-net.md) §2.1）而留下「变更延迟两项待补」。该阻塞项已于 2026-09-15 修复并补回归测试，变更延迟两项随之补齐；「旧路径基线」本身随 RM-V36 收敛归档为历史。
