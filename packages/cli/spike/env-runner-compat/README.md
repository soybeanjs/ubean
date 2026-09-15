# env-runner 兼容性 spike（RM-V04）

结论文档：[docs/env-runner-spike.md](../../../docs/env-runner-spike.md)。这里是产出结论用的可复现脚本，
**不参与 CI**（需要拉起 worker 进程与 vite dev server，不适合作为回归闸门）。

```bash
# 已证明可用：最小 worker 处理请求并返回 200
node packages/cli/spike/env-runner-compat/simple-host.mjs

# 未打通：worker 内 ModuleRunner → 宿主 DevEnvironment（invoke 无人应答，60s 超时）
node packages/cli/spike/env-runner-compat/host.mjs
```

`env-runner` 在 `packages/cli` 里是 **devDependency**（spike 用）；RM-V08 验证通过后再决定是否提升为运行时依赖。
