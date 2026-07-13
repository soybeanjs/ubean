import { createRobotsResponse, defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const baseUrl = `${c.req.raw.url.split('/').slice(0, 3).join('/')}`;
  return createRobotsResponse({
    userAgent: '*',
    allow: '/',
    disallow: ['/api/', '/_devtools', '/_scalar', '/_openapi.json'],
    sitemap: `${baseUrl}/sitemap.xml`
  });
});
