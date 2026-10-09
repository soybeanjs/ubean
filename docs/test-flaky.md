# flaky 用例待修清单

> 本文件是 **committed 的人工维护清单**，与 `scripts/flaky.mjs` 配套。它记录的是「观测到过
> flaky（重试后才通过）但尚未修掉」的用例 —— flaky 用例的唯一归宿是修掉它，不是靠重试转绿。
>
> 生成与判定的机制与实现见 [`scripts/flaky.mjs`](../scripts/flaky.mjs)（CI 门禁：`node scripts/flaky.mjs --check`）。

## 为什么需要这份清单

重试把偶发失败变成绿，也就顺手抹掉了它留下的唯一痕迹。没有清单时，同一个 flaky 用例可以年复一年
地偶发红，每次都被当成「这次运气不好」重跑一次了事 —— 没有任何东西会积累，因此也永远没人修它。

清单把「观测到」变成一条**有状态、可追踪**的记录：进了清单，它就在待修队列里；修掉后改状态或删行。

## 门禁

`node scripts/flaky.mjs --check`（CI 里是独立一步）读取报告并对照本清单：

- **观测到 flaky 但没写进本清单 → 退出非零。** 这是刻意的：只报告不门禁时，「flaky 进入待修清单」
  只能靠人自觉，清单会永远空着而验收项看起来已经满足。红的是「你观测到了但没记下来」，不是
  「这条用例偶尔失败」—— 后者由重试兜住，不会误伤无关 PR。
- **清单里有、本次没观测到 → 只提示，不判定。** flaky 本来就是间歇的，一次没复现不能作为
  「已修」的证据；把它做成错误会逼人删条目，反而丢掉历史。
- **报告里 `retriesEnabled: false` → 不参与判定。** 没给过重试机会时「0 条 flaky」只说明没测，
  不构成「没有 flaky」的证据。CI 下 L2 / L3 由 `process.env.CI` 自动启用 1 次重试；
  本地可用 `UBEAN_TEST_RETRIES=1` 复现同一条链路。

## 覆盖面：L1 尚未接入

| 层 | 目录 | retry | reporter | 门禁是否判定 |
| --- | --- | --- | --- | --- |
| L1 包内单测 | `packages/*/test/` | 无 | 无 | 否 |
| L2 示例集成 | `examples/ubean-test/test/` | ✅ | ✅ | 是 |
| L3 浏览器 E2E | `test/browser/` | ✅ | ✅ | 是 |

L1 跑得最多（CI 里 33 个文件 / 436 例，且含所有 spawn 起构建的用例），却是唯一没接 retry 与
reporter 的一层：`packages/*/vite.config.ts` 的 `test` 段只配了串行/超时，没有 `retry: resolveRetries()`，
也没有 `reporters: [[flakyReporter, { layer: 'L1' }]]`（`scripts/flaky.mjs` 的 `LAYER_LABELS` 同样
还没有 `L1`）。因此这份清单**不代表 L1 没有 flaky**，只代表它的 flaky 现在无人记录。

要不要接 L1 是一个独立议题（24 个包的配置面 + 重试会掩盖 spawn 类挂住的代价）；在那之前，
**别把门禁全绿读成「全仓没有 flaky」**。L1 里唯一被观测到的偶发「红」是挂住而不是结果错
（CI run 37943643207，windows-latest / Node 24），它的处置不是重试，而是让看门狗自己说话 ——
见 `packages/cli/test/build-errors.test.ts` 文件头的「看门狗必须先于用例超时触发」。

## 表格怎么填

- **用例**：vitest 的用例全名（`describe` 拼接后的 `fullName`）。
- **文件**：仓库相对路径；能拿到行号时写 `path:line`（行号来源是 `test.task.location?.line`，
  浏览器模式下可能拿不到，此时省略）。
- **层**：`L2`（示例集成，`examples/ubean-test`）或 `L3`（浏览器 E2E，仓库根 `test/browser`）。
- **首次观测**：`YYYY-MM-DD`。
- **状态**：`待修` / `修复中` / `已修（待观察）`。删行前建议先经历一次「已修（待观察）」——
  一次未复现不算修好。

## 待修清单

| 用例 | 文件 | 层 | 首次观测 | 状态 |
| --- | --- | --- | --- | --- |
| （暂无） | | | | |
