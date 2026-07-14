import { defineMiddleware, createI18nMiddleware, defineLocale, setLocale, getDefaultLocale } from 'ubean';

// Create i18n middleware instance once.
const i18nHandler = createI18nMiddleware({
  strategy: 'prefix_except_default',
  defaultLocale: 'en',
  locales: ['en', 'zh'],
  detectFromHeader: true,
  detectFromCookie: true,
  redirectOnLocaleMismatch: false
});

let localesLoaded = false;

// Directly import locale JSON files for reliable loading
const enMessages = {
  app: { title: 'Ubean Test', description: 'A test project for ubean framework' },
  common: { hello: 'Hello, {name}!', welcome: 'Welcome to ubean', goodbye: 'Goodbye' },
  items: {
    count: 'You have {count} item | You have {count} items',
    explicit: 'No items | One item | Many items',
    categorized: 'zero: No items | one: One item | other: {count} items'
  },
  navigation: { home: 'Home', about: 'About', features: 'Features', dashboard: 'Dashboard' },
  linked: { greeting: 'Hello, @:common.hello', nested: '@:navigation.home page' },
  messages: { loading: 'Loading...', error: 'An error occurred', success: 'Operation completed successfully' }
};

const zhMessages = {
  app: { title: 'Ubean 测试', description: 'ubean 框架测试项目' },
  common: { hello: '你好，{name}！', welcome: '欢迎使用 ubean', goodbye: '再见' },
  items: {
    count: '你有 {count} 个项目',
    explicit: '没有项目 | 一个项目 | 很多项目',
    categorized: 'zero: 没有项目 | one: 一个项目 | other: {count} 个项目'
  },
  navigation: { home: '首页', about: '关于', features: '功能', dashboard: '仪表盘' },
  linked: { greeting: '你好，@:common.hello', nested: '@:navigation.home 页面' },
  messages: { loading: '加载中...', error: '发生错误', success: '操作成功完成' }
};

function ensureLocalesLoaded() {
  if (localesLoaded) return;
  localesLoaded = true;
  defineLocale({ code: 'en', messages: enMessages, dir: 'ltr', isDefault: true });
  defineLocale({ code: 'zh', messages: zhMessages, dir: 'ltr' });
  setLocale(getDefaultLocale());
}

export default defineMiddleware(async (c, next) => {
  ensureLocalesLoaded();
  return i18nHandler(c, next);
});
