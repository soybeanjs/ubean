import { defineHandler } from 'ubean';

const users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' }
];

export const GET = defineHandler(c => {
  const id = parseInt(c.req.param('id')!, 10);
  const user = users.find(u => u.id === id);

  if (!user) {
    return c.json(
      { error: 'User Not Found', statusCode: 404, data: { id, message: `User with id ${id} not found` } },
      404
    );
  }

  return c.json(user);
});
