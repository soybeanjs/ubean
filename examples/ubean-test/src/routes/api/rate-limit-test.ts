import { defineHandler, defineRateLimit } from 'ubean';

const rateLimit = defineRateLimit({
  maxRequests: 5,
  windowMs: 10000,
  standardHeaders: true,
  legacyHeaders: true
});

export const GET = defineHandler(rateLimit, c => {
  return c.json({
    message: 'Rate limit test',
    limit: 5,
    windowMs: 10000,
    timestamp: Date.now()
  });
});
