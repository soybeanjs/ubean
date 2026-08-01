/**
 * 流式 metadata 爬虫降级(Task 6 / P9-24)—— HTTP 集成测试入口
 *
 * 验证 `isBotUserAgent` 通过 `ubean` 主包正确导出且运行时行为正确。
 * router 内部的流式降级路径依赖完整的 SSR/renderer 上下文,难以用
 * 自包含子应用复现,因此本端点直接调用导出的 `isBotUserAgent` 验证
 * 检测逻辑(单元测试已覆盖完整 UA 矩阵,这里聚焦导出链路与端到端可达性)。
 *
 * Actions:
 * - detect:      传入 `ua` query,返回 `{ isBot }` 检测结果
 * - botUAs:      批量验证已知爬虫 UA 全部识别为 true
 * - browserUAs:  批量验证常见浏览器 UA 全部识别为 false
 * - empty:       验证空/undefined/null UA 返回 false
 */
import { defineHandler, isBotUserAgent } from 'ubean';

export const GET = defineHandler(async c => {
  const action = c.req.query('action') || 'info';

  switch (action) {
    // 传入 ua query 返回检测结果
    case 'detect': {
      const ua = c.req.query('ua') ?? '';
      return c.json({ ua, isBot: isBotUserAgent(ua) });
    }

    // 批量验证爬虫 UA
    case 'botUAs': {
      const uas = [
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
        'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Mozilla/5.0 (compatible; Twitterbot/1.0)',
        'LinkedInBot/1.0 (compatible; Mozilla/5.0)',
        'Slackbot 1.0 (+https://api.slack.com/robots)',
        'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
        'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'
      ];
      const results = uas.map(ua => ({ ua, isBot: isBotUserAgent(ua) }));
      const allDetected = results.every(r => r.isBot === true);
      return c.json({ allDetected, results });
    }

    // 批量验证浏览器 UA
    case 'browserUAs': {
      const uas = [
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
      ];
      const results = uas.map(ua => ({ ua, isBot: isBotUserAgent(ua) }));
      const allNotBot = results.every(r => r.isBot === false);
      return c.json({ allNotBot, results });
    }

    // 空/undefined/null UA
    case 'empty': {
      return c.json({
        emptyString: isBotUserAgent(''),
        undefined: isBotUserAgent(undefined),
        null: isBotUserAgent(null)
      });
    }

    default:
      return c.json({
        actions: ['detect', 'botUAs', 'browserUAs', 'empty']
      });
  }
});
