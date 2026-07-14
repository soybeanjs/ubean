import { defineHandler, createSSEStream } from 'ubean';

export const GET = defineHandler(c => {
  return createSSEStream(
    c,
    {
      async onOpen(conn) {
        conn.send({ event: 'connected', data: { message: 'SSE connection established', time: Date.now() } });

        let count = 0;
        const interval = setInterval(() => {
          count++;
          conn.send({ event: 'tick', data: { count, timestamp: Date.now() } });
          if (count >= 3) {
            conn.send({ event: 'done', data: { message: 'All events sent' } });
            conn.close();
            clearInterval(interval);
          }
        }, 100);
      }
    },
    { retry: 2000 }
  );
});
