import { defineEventHandler } from '@ubean/core';

const users = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Doe', email: 'jane@example.com' },
  { id: 3, name: 'Bob Smith', email: 'bob@example.com' }
];

export default defineEventHandler((c) => {
  const id = parseInt(c.req.param('id'));
  const user = users.find(u => u.id === id);
  
  if (!user) {
    return c.status(404).json({ error: 'User not found' });
  }
  
  return user;
});
