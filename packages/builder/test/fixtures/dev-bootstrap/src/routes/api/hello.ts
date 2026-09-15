// fixture 放在 `packages/builder` 之下，因此只能解析到 builder 的依赖 —— 这里用
// `@ubean/routes`（builder 的直接依赖，导出同名 `defineHandler`）。用户项目里写
// `ubean/server`（聚合入口），语义相同。
import { defineHandler } from '@ubean/routes';

export const GET = defineHandler(c => c.json({ hello: 'world' }));
