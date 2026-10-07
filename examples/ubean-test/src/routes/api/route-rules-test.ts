import { defineHandler, compileRouteRules, matchRouteRules } from 'ubean/server';

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
  // `compileRouteRules` 返回的是**编译后的数组**（{ path, pattern, rule }），不是原始
  // Record —— 对它用 Object.keys 只会得到 '0'/'1'/'2' 这种下标，必须取 .path。
  const rulePaths = rules.map(r => r.path);
  // `matchRouteRules` 无命中时返回 `{}`（真值），所以不能靠真值判断有没有命中，
  // 否则「没匹配到任何规则」永远伪装成「匹配到了空规则」。
  const hasMatch = Object.keys(matched).length > 0;

  return c.json({
    action: 'route-rules-test',
    testPath,
    matched: hasMatch
      ? {
          cache: matched.cache,
          headers: matched.headers,
          redirect: matched.redirect
        }
      : null,
    availableRules: rulePaths,
    ruleCount: rulePaths.length
  });
});
