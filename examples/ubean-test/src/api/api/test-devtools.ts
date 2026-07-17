import { defineHandler } from 'ubean';

export default defineHandler(async c => {
  return c.json({ message: 'SrcApiApiTestdevtools endpoint' });
});
