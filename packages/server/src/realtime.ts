/**
 * @ubean/server/realtime — 实时通信聚合入口 (ADR-0003 OPT-06)
 *
 * 聚合 WebSocket + SSE 两个内部模块，提供统一的实时通信能力入口。
 * 主入口 `@ubean/server` 仍 re-export 全部符号（便利入口）。
 */
export * from './websocket';
export type * from './websocket';
export * from './sse';
export type * from './sse';
