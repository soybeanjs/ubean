import { describe, it, expect } from 'vitest';
import type { ScannedPageRoute } from '@ubean/scan';
import { collectPrerenderRoutes } from '../src/prerender';

function page(path: string): ScannedPageRoute {
  return {
    fullPath: path,
    relativePath: path.slice(1),
    dirname: '',
    basename: path,
    name: path,
    route: path,
    path,
    isReuse: false,
    isMarkdown: false
  } as ScannedPageRoute;
}

describe('collectPrerenderRoutes contentRoutes', () => {
  it('merges content collection URLs into include', () => {
    const { routes } = collectPrerenderRoutes([page('/')], {
      include: ['/about'],
      contentRoutes: ['/blog/hello']
    });
    expect(routes).toEqual(expect.arrayContaining(['/about', '/blog/hello']));
  });
});
