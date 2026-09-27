# ADR-0005 · OPT-09 实现设计 + OPT-11 落地时序 + OPT-01 待决子项收尾

- **状态**: implemented
- **日期**: 2026-08-02
- **修订**: 2026-09-27（压缩为决策摘要，删除影响面 / 验收；修正包数与死路径）
- **关联任务**: OPT-09、OPT-11、OPT-01（待决子项）
- **决策者**: grilling 会话（用户 + 助手）

> 归档说明：源任务文档 `optimize.md`（OPT-* 优化任务）已随任务完成归档删除，本 ADR 保留为历史决策记录。实现已落地；约定正文见站点 `apps/docs/src/content/{zh,en}/contributing/engineering.md` §10（CodeGraph 工作流）/ §11（扩展包契约表）；「真理源」「校验形态」等词汇见 [docs/glossary.md](../glossary.md)。

## 决策摘要

1. **OPT-09（包树 CI 校验）**：真理源 = `packages/*/package.json` 的 `name` 字段（**不是**目录名 —— `builder/` → `@ubean/build`、`ubean` 无 scope），当前 **24** 个包名集合；校验方式 = 存在性 + 计数（断言「N 个包」与实际一致）；不解析树结构（`├──` 正则太脆）、不生成新清单文件；挂载点为 `.github/workflows/ci.yml` 的 test 步骤后。
   - **唯一范围事实**：校验**仅覆盖 `AGENTS.md`**。`README.md` / `README.zh_CN.md` **刻意排除** —— 纳进来就是第三处需要同步维护、又会生新漂移点的地方，README 由人保证。
2. **OPT-11（CodeGraph 进 PR 流）**：交付物 = `contributing/engineering.md` §10 的约定文本，**先于**任何代码 PR 独立落地；`OPT-01` 的重命名 PR 是首个「遵循」该约定的样板（`codegraph impact createUbeanApp` 结果附入 PR 描述）。明确区分「定规」与「首用」——勿把 impact 输出塞进约定自身的非代码 PR。
3. **OPT-01 待决子项收尾**：**不将 `createUbeanClientApp` 纳入主 `ubean` 聚合器入口**。依据：Vue 工厂仅 `@ubean/client` 直连可达，唯一真实消费者是内部虚拟模块生成器；纳入会扩大对外 API 表面，与重命名「降漂移 / 降心智负担」的初衷部分冲突。见 [ADR-0001](0001-rename-vue-create-ubean-app.md)。
