/**
 * 页面 glob 的扩展名集合。
 *
 * `import.meta.glob` 的范围必须与扫描器一致，否则会出现「扫描说不含 tsx、产物却
 * 仍然把 `src/pages/*.tsx` 拉进构建」→ 构建期 `[PARSE_ERROR] Unexpected JSX expression`
 * （关掉 JSX 时依然报错的真实原因）。
 *
 * 两类后缀与 `pages.extensions` 无关、始终参与：
 * - `ts` / `js` —— `.reuse.ts` / `.meta.ts`（及其 `.js` 版本）是纯元数据文件
 *   （只含 `definePage`），扫描器用独立 pattern `**\/*.reuse.{ts,js}` /
 *   `**\/*.meta.{ts,js}` 收起，**不受 `extensions` 影响**。glob 缺了 ts/js，
 *   元数据页能扫到却加载不到 → 路由表与实际可加载模块脱节。
 *   顺带覆盖用户把 `ts` 显式写进 `extensions` 的情形。
 * - `md` / `mdx` —— markdown 页面，由 `markdown` 开关决定加不加
 */
export function pageGlobExtensions(extensions: string[] | undefined, markdownExts: string[] = []): string {
  // `undefined` / 空数组 → 默认全开（与 `resolvePageCompilers` 同一判据）：
  // 手工构造的 config 对象不带 `pages` 时，glob 不能退化成「只扫 ts/js」。
  const base = extensions && extensions.length > 0 ? extensions : ['vue', 'tsx', 'jsx'];
  const all = new Set<string>(base);

  // 元数据页后缀。`reuse`/`meta` 是文件名的倒数第二段，扩展名只有 ts/js，
  // 所以这里加的是裸 `ts`/`js` —— 不是 `reuse.ts` 这种复合串（glob 里没有这个词法）。
  all.add('ts');
  all.add('js');

  for (const ext of markdownExts) all.add(ext);

  return [...all].join(',');
}
