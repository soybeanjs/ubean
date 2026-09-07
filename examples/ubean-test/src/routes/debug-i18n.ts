import { t, getRequestLocale, getLocaleMessages, listLocaleCodes } from 'ubean/i18n';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(async c => {
  return c.json({
    currentLocale: getRequestLocale(c),
    registeredLocales: listLocaleCodes(),
    translation: t('common.hello', { name: 'debug' }),
    messagesKeys: Object.keys(getLocaleMessages(getRequestLocale(c)) || {})
  });
});
