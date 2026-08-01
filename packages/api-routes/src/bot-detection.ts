/**
 * Bot / crawler User-Agent 检测(P9-24 / Task 6 流式 metadata)。
 *
 * 流式 SSR 把动态 `<head>` metadata 注入到响应尾部(浏览器把它们
 * 移动到 `<head>`),但社交爬虫(Facebook OG、Twitter、Slack 等)
 * 只解析初始 `<head>`,会错过这些标签。检测到爬虫 UA 时,router
 * 自动降级为缓冲渲染(`renderPage`),保证 metadata 出现在初始
 * `<head>` 中。
 *
 * 检测基于 UA 子串匹配(大小写不敏感),覆盖主流搜索引擎与社交
 * 预览爬虫。空 UA 视为非爬虫(部分正常请求也带空 UA)。
 */

/**
 * 已知的爬虫 UA 标识(小写子串匹配)。
 * 来源:各家官方文档 + Nuxt `is-bot` / Next.js `next/dist/server/app-render/user-agent`
 * 常见爬虫清单。
 */
const BOT_TOKENS = [
  // 搜索引擎
  'googlebot',
  'bingbot',
  'baiduspider',
  'yandexbot',
  'duckduckbot',
  'slurp', // Yahoo
  'sogou',
  'exabot',
  'facebot',
  'ia_archiver', // Alexa
  'applebot',
  'bytespider', // 字节跳动
  'petalbot', // 华为
  // 社交预览
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'slacker', // Slack link unfurl (`Slackbot-LinkExpanding` 等)
  'slackbot',
  'telegrambot',
  'whatsapp',
  'skypeuripreview',
  'discordbot',
  'pinterestbot',
  'redditbot',
  // 通用爬虫/抓取工具
  'crawler',
  'spider',
  'bot/',
  'bot;', // UA 末尾的 `bot;`
  'preview', // 一些预览生成器
  'fetcher',
  'scraper',
  // SEO/监控
  'ahrefsbot',
  'semrushbot',
  'mj12bot',
  'dotbot',
  'pingdom',
  'gtmetrix',
  'pagespeed',
  'googlestackdrivermonitoring'
] as const;

const BOT_PATTERN = new RegExp(BOT_TOKENS.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i');

/**
 * 判断 User-Agent 是否为爬虫/社交预览机器人。
 *
 * @param ua User-Agent 字符串(来自 `c.req.header('user-agent')`)
 * @returns `true` 表示疑似爬虫,应降级为缓冲渲染以保证 metadata 完整
 */
export function isBotUserAgent(ua: string | undefined | null): boolean {
  if (!ua) return false;
  return BOT_PATTERN.test(ua);
}
