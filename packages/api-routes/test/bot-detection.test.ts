/**
 * Bot / crawler UA 检测单元测试(P9-24 / Task 6 流式 metadata)。
 *
 * 验证 `isBotUserAgent`:
 * - 主流搜索引擎爬虫 UA 被识别
 * - 主流社交预览爬虫 UA 被识别
 * - 常见浏览器 UA 不被误判
 * - 空 / undefined / null UA 视为非爬虫
 * - 大小写不敏感
 */
import { describe, it, expect } from 'vitest';
import { isBotUserAgent } from '../src/index';

describe('isBotUserAgent (P9-24 bot detection)', () => {
  describe('搜索引擎爬虫', () => {
    const searchBots = [
      ['Googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
      ['Googlebot-Image', 'Googlebot-Image/1.0'],
      ['Bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
      ['Baiduspider', 'Mozilla/5.0 (compatible; Baiduspider/2.0; +http://www.baidu.com/search/spider.html)'],
      ['YandexBot', 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)'],
      ['DuckDuckBot', 'Mozilla/5.0 (compatible; DuckDuckBot/1.0; +http://duckduckgo.com/duckduckbot.html)'],
      ['Slurp (Yahoo)', 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)'],
      ['Sogou', 'Sogou web spider/4.0'],
      ['AppleBot', 'Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)'],
      ['Bytespider', 'Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)'],
      ['PetalBot', 'Mozilla/5.0 (compatible; PetalBot;+https://webmaster.petalsearch.com/site/petalbot)'],
      ['Exabot', 'Mozilla/5.0 (compatible; Exabot/3.0; +http://www.exabot.com/go/robot)'],
      ['Alexa IA Archiver', 'ia_archiver (+http://www.alexa.com/site/help/webmasters; crawler@alexa.com)']
    ];

    for (const [name, ua] of searchBots) {
      it(`识别 ${name}`, () => {
        expect(isBotUserAgent(ua)).toBe(true);
      });
    }
  });

  describe('社交预览爬虫', () => {
    const socialBots = [
      ['Facebook', 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'],
      ['Twitter', 'Mozilla/5.0 (compatible; Twitterbot/1.0)'],
      ['LinkedIn', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; +https://www.linkedin.com/help/linkedin/answer/86003)'],
      ['Slack-Bot', 'Slackbot 1.0 (+https://api.slack.com/robots)'],
      ['Slack-LinkExpanding', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
      ['Telegram', 'TelegramBot (like TwitterBot)'],
      ['WhatsApp', 'WhatsApp/2.19.81 A'],
      ['Skype URI Preview', 'SkypeUriPreview Preview/0.5'],
      ['Discord', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
      ['Pinterest', 'Mozilla/5.0 (compatible; Pinterestbot/1.0; +http://www.pinterest.com/bot.html)'],
      ['Reddit', 'Mozilla/5.0 (compatible; redditbot/1.0; +http://www.reddit.com/feedback)']
    ];

    for (const [name, ua] of socialBots) {
      it(`识别 ${name}`, () => {
        expect(isBotUserAgent(ua)).toBe(true);
      });
    }
  });

  describe('SEO / 监控爬虫', () => {
    const seoBots = [
      ['AhrefsBot', 'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)'],
      ['SemrushBot', 'Mozilla/5.0 (compatible; SemrushBot/7~bl; +http://www.semrush.com/bot.html)'],
      ['MJ12bot', 'Mozilla/5.0 (compatible; MJ12bot/v1.4.8; http://mj12bot.com/)'],
      ['DotBot', 'Mozilla/5.0 (compatible; DotBot/1.2; +https://opensiteexplorer.org/dotbot; help@moz.com)'],
      ['Pingdom', 'Mozilla/5.0 (compatible; Pingdom.com_bot_version_1.4)'],
      ['GTmetrix', 'Mozilla/5.0 (X11; U; Linux i686 (x86_64); en-US; rv:1.9.0.19) Gecko/2010051407 GTmetrix'],
      ['PageSpeed', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko; PageSpeed Insights) Chrome/95.0.4638.54 Safari/537.36'],
      ['Google Stackdriver Monitoring', 'GoogleStackdriverMonitoring-UptimeChecks']
    ];

    for (const [name, ua] of seoBots) {
      it(`识别 ${name}`, () => {
        expect(isBotUserAgent(ua)).toBe(true);
      });
    }
  });

  describe('通用爬虫/抓取工具子串', () => {
    it('识别含 "crawler" 的 UA', () => {
      expect(isBotUserAgent('Some-Crawler/1.0')).toBe(true);
    });
    it('识别含 "spider" 的 UA', () => {
      expect(isBotUserAgent('TestSpider/1.0')).toBe(true);
    });
    it('识别以 "bot/" 结尾的 UA', () => {
      expect(isBotUserAgent('Fake bot/1.0')).toBe(true);
    });
    it('识别 "bot;" 子串(分号分隔的 UA 末尾 token)', () => {
      expect(isBotUserAgent('Mozilla/5.0 (compatible; Some bot; +http://x.com)')).toBe(true);
    });
  });

  describe('浏览器 UA 不误判', () => {
    const browsers = [
      ['Chrome (Mac)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'],
      ['Chrome (Windows)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'],
      ['Firefox (Mac)', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.2; rv:121.0) Gecko/20100101 Firefox/121.0'],
      ['Safari (iPhone)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'],
      ['Edge (Windows)', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'],
      ['Opera', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'],
      ['Chrome (Android)', 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36']
    ];

    for (const [name, ua] of browsers) {
      it(`不识别 ${name}`, () => {
        expect(isBotUserAgent(ua)).toBe(false);
      });
    }
  });

  describe('边界情况', () => {
    it('空字符串返回 false', () => {
      expect(isBotUserAgent('')).toBe(false);
    });
    it('undefined 返回 false', () => {
      expect(isBotUserAgent(undefined)).toBe(false);
    });
    it('null 返回 false', () => {
      expect(isBotUserAgent(null)).toBe(false);
    });
    it('大小写不敏感(全小写 googlebot)', () => {
      expect(isBotUserAgent('googlebot/2.1')).toBe(true);
    });
    it('大小写不敏感(全大写 GOOGLEBOT)', () => {
      expect(isBotUserAgent('GOOGLEBOT/2.1')).toBe(true);
    });
    it('大小写不敏感(混合大小写 GoogleBot)', () => {
      expect(isBotUserAgent('GoogleBot/2.1')).toBe(true);
    });
    it('普通 UA 含 "robot" 不被识别为爬虫(避免子串误判)', () => {
      // "robot" 不在 token 列表中,避免 "Robot, take out the trash" 这类误判
      expect(isBotUserAgent('Mozilla/5.0 (Robot user agent test)')).toBe(false);
    });
  });
});
