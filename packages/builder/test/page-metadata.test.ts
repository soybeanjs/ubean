/**
 * 页面元数据进产物（`serializePagesForEntry`）。
 *
 * 这个文件存在的理由是**一次「dev 正常、产物坏掉」的缺陷**：服务端入口的页面表是白名单序列化，
 * 而白名单只列了 `relativePath/name/route/layout/reuseTarget/isReuse/pageMeta` —— `matchers` /
 * `slot` 被**静默丢掉**。dev 下路由表用的是扫描得到的活对象（`enhanceDevApp` /
 * `buildDevSsrRoutes` 直接拿 `scanResult.pages`），所以本地一切正常；构建产物里 `[id=numeric]`
 * 的路由因此不校验参数：dev 返回 404，生产返回 200。
 *
 * 白名单式序列化的风险是「加字段时忘了同步」，而症状只在产物里出现，因此这里逐个字段锁住。
 * （拦截路由的 `interceptFrom` / `interceptTarget` 也曾在这份白名单里，随该约定一起移除。）
 */
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@ubean/scan';
import { serializePagesForEntry } from '../src/production';

type Pages = ScanResult['pages'];

function page(overrides: Partial<Pages[number]> = {}): Pages[number] {
  return {
    fullPath: '/app/src/pages/order/[id=numeric].vue',
    relativePath: 'order/[id=numeric].vue',
    dirname: '/app/src/pages/order',
    basename: '[id=numeric].vue',
    name: 'OrderDetail',
    route: '/order/:id',
    path: '/order/:id',
    isReuse: false,
    isMarkdown: false,
    ...overrides
  } as Pages[number];
}

describe('serializePagesForEntry', () => {
  it('文件路由语法的语义字段全部保留（matchers / slot）', () => {
    const json = serializePagesForEntry([page({ matchers: { id: 'numeric' }, slot: 'sidebar' })]);
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;

    expect(parsed[0].matchers).toEqual({ id: 'numeric' });
    expect(parsed[0].slot).toBe('sidebar');
  });

  it('其余运行时字段（route / layout / cache / reuse / pageMeta）照旧保留', () => {
    const json = serializePagesForEntry([
      page({
        layout: ['default', 'admin'],
        cache: true,
        isReuse: true,
        reuseTarget: 'target.vue',
        pageMeta: { name: 'x', path: '/x', head: { title: 'X' } }
      })
    ]);
    const first = (JSON.parse(json) as Array<Record<string, unknown>>)[0];

    expect(first.route).toBe('/order/:id');
    expect(first.layout).toEqual(['default', 'admin']);
    expect(first.cache).toBe(true);
    expect(first.isReuse).toBe(true);
    expect(first.reuseTarget).toBe('target.vue');
    expect(first.pageMeta).toMatchObject({ name: 'x', path: '/x' });
  });

  it('不把构建机的文件系统路径带进产物（fullPath / dirname / basename）', () => {
    const json = serializePagesForEntry([page()]);
    expect(json).not.toContain('/app/src/pages');
    expect(json).not.toContain('fullPath');
  });
});
