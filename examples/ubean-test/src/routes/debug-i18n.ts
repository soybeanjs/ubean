import { defineHandler } from 'ubean';
import { useI18n, getLocaleMessages, getRegisteredLocales } from 'ubean/runtime/i18n';

export const GET = defineHandler(async c => {
  const i18n = useI18n();
  const locales = getRegisteredLocales();
  const currentMessages = getLocaleMessages();

  return c.json({
    currentLocale: i18n.getLocale(),
    fallbackLocale: i18n.fallbackLocale,
    availableLocales: i18n.availableLocales,
    registeredLocales: locales,
    hasMessages: !!currentMessages,
    messagesKeys: currentMessages ? Object.keys(currentMessages) : []
  });
});
