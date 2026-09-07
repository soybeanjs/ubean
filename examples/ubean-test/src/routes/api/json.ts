import { defineHandler } from 'ubean/server';

export const GET = defineHandler(c => {
  return c.json({
    json: true,
    message: 'This is a JSON response',
    data: {
      number: 42,
      string: 'hello',
      boolean: true,
      array: [1, 2, 3],
      nested: { key: 'value' }
    }
  });
});
