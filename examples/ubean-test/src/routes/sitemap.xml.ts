import { createSitemapResponse, defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const baseUrl = `${c.req.raw.url.split('/').slice(0, 3).join('/')}`;
  return createSitemapResponse([
    { loc: `${baseUrl}/`, changefreq: 'daily', priority: 1.0 },
    { loc: `${baseUrl}/about`, changefreq: 'weekly', priority: 0.8 },
    { loc: `${baseUrl}/features`, changefreq: 'weekly', priority: 0.8 }
  ]);
});
