/**
 * Ambient module shape for `@ubean/cli` — declared as `any` to allow dynamic
 * imports without a static dependency. `@ubean/cli` is an optional peerDep
 * (frontend-only projects don't need it), so TypeScript cannot resolve the
 * real types in this package's `typecheck` step.
 *
 * At runtime, the actual `@ubean/cli` (if installed) returns the real
 * `createFsOps` / `scaffold` / `deleteScaffold` / `recoverScaffold`
 * implementations. The dynamic `import('@ubean/cli')` in `vite-server.ts`
 * is wrapped in try/catch and falls back to `undefined` when CLI is missing.
 */
declare module '@ubean/cli' {
  export const createFsOps: any;
  export const scaffold: any;
  export const deleteScaffold: any;
  export const recoverScaffold: any;
  // Allow future exports without re-declaring each one
  const _: { [key: string]: any };
  export default _;
}
