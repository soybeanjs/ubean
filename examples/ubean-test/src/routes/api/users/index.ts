import { defineHandler } from 'ubean';

const users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' }
];

export const GET = defineHandler(c => {
  return c.json({
    users,
    total: users.length
  });
});

export const POST = defineHandler(async c => {
  const body = await c.req.json().catch(() => ({}));
  const newUser = {
    id: users.length + 1,
    name: body.name || 'Unknown',
    email: body.email || 'unknown@example.com',
    role: body.role || 'user'
  };
  users.push(newUser);
  return c.json(newUser, 201);
});
