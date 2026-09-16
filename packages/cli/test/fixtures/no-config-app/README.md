# cli matrix fixture（无用户 `vite.config.ts`）

构建矩阵里「无配置注入」与 worker 目标（cloudflare）两格在这个项目上跑：它**本就没有**
`vite.config.ts`，因此 CLI 会注入全部 builtin 插件，正是那两格要覆盖的分支。

刻意**与 `packages/builder/test/fixtures/build-project` 分开**：那个 fixture 被 builder 自己的
测试（`production-build.test.ts` 等）使用，而本仓测试是 `pnpm -r --parallel` 跑的 —— 两个包
共用同一个目录、又各自清理 `.temp-*` / `.ubean`，实测出现「单跑绿、全量跑红」的互相干扰。
