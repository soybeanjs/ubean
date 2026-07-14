import { createError, UbeanError, isUbeanError, defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const type = c.req.query('type') || 'generic';

  if (type === 'ubean-error') {
    throw new UbeanError({
      statusCode: 418,
      statusMessage: "I'm a teapot",
      data: { custom: true, class: 'UbeanError' }
    });
  }

  if (type === 'is-check') {
    const err = createError({ statusCode: 403, statusMessage: 'Forbidden' });
    return c.json({
      isUbeanError: isUbeanError(err),
      statusCode: err.statusCode,
      statusMessage: err.statusMessage
    });
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Bad Request',
    data: { reason: 'Test createError()', type }
  });
});
