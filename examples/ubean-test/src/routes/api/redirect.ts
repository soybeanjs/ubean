import { defineHandler, redirect } from 'ubean';

export const GET = defineHandler(() => {
  return redirect('/api/hello');
});
