import { defineHandler } from 'ubean';

export const GET = defineHandler(c => {
  return c.text('This is a plain text response from ubean!');
});
