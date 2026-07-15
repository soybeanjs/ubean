import { defineHandler, defineHandlerMeta, describeRoute } from 'ubean';

const users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' }
];

export const GET = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Get user by ID',
    description: 'Returns a single user by their ID.',
    tags: ['Users'],
    responses: {
      200: {
        description: 'The requested user'
      },
      404: {
        description: 'User not found'
      }
    }
  }),
  c => {
    const rawId = c.req.param('id')!;
    const id = parseInt(rawId, 10);
    const user = users.find(u => u.id === id);

    if (!user) {
      return c.json({ id: rawId });
    }

    return c.json(user);
  }
);

export const PUT = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Update user by ID',
    description: 'Updates a user by their ID.',
    tags: ['Users'],
    responses: { 200: { description: 'The updated user' }, 404: { description: 'User not found' } }
  }),
  async c => {
    const id = parseInt(c.req.param('id')!, 10);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) {
      return c.json({ error: 'User Not Found', statusCode: 404 }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    users[idx] = { ...users[idx], ...body, id };
    return c.json(users[idx]);
  }
);

export const PATCH = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Patch user by ID',
    description: 'Partially updates a user by their ID.',
    tags: ['Users'],
    responses: { 200: { description: 'The patched user' }, 404: { description: 'User not found' } }
  }),
  async c => {
    const id = parseInt(c.req.param('id')!, 10);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) {
      return c.json({ error: 'User Not Found', statusCode: 404 }, 404);
    }
    const body = await c.req.json().catch(() => ({}));
    users[idx] = { ...users[idx], ...body, id };
    return c.json(users[idx]);
  }
);

export const DELETE = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Delete user by ID',
    description: 'Deletes a user by their ID.',
    tags: ['Users'],
    responses: { 200: { description: 'Deletion confirmed' }, 404: { description: 'User not found' } }
  }),
  c => {
    const id = parseInt(c.req.param('id')!, 10);
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) {
      return c.json({ error: 'User Not Found', statusCode: 404 }, 404);
    }
    const deleted = users.splice(idx, 1)[0];
    return c.json({ deleted: true, user: deleted });
  }
);
