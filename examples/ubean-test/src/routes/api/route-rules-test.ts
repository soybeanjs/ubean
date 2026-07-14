import { defineHandler, compileRouteRules, matchRouteRules } from 'ubean';

const rules = compileRouteRules({
  '/api/cached/**': {
    cache: { ttl: 60, swr: true },
    headers: { 'X-Cache-Rule': 'enabled' }
  },
  '/api/secure/**': {
    headers: { 'X-Security-Rule': 'enforced' }
  },
  '/api/redirect-old/**': {
    redirect: '/api/redirect-new/**'
  }
});

export const GET = defineHandler(c => {
  const testPath = c.req.query('path') || '/api/cached/items';
  const matched = matchRouteRules(testPath, rules);

  return c.json({
    action: 'route-rules-test',
    testPath,
    matched: matched
      ? {
          cache: matched.cache,
          headers: matched.headers,
          redirect: matched.redirect
        }
      : null,
    availableRules: Object.keys(rules),
    ruleCount: Object.keys(rules).length
  });
});
