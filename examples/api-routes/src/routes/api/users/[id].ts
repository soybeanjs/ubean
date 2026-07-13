import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  const id = c.req.param('id');
  return Response.json({ id, name: 'John Doe', email: 'john@example.com' });
});
