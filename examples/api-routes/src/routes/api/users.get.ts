import { defineEventHandler } from 'ubean';

const users = [
  { id: 1, name: 'John Doe', email: 'john@example.com' },
  { id: 2, name: 'Jane Doe', email: 'jane@example.com' },
  { id: 3, name: 'Bob Smith', email: 'bob@example.com' }
];

export default defineEventHandler(() => {
  return users;
});
