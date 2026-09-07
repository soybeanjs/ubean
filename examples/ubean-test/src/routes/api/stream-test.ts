import { createStreamResponse } from 'ubean';
import { defineHandler } from 'ubean/server';

export const GET = defineHandler(() => {
  return createStreamResponse({ headers: { 'Content-Type': 'text/plain; charset=utf-8' } }, async stream => {
    stream.enqueue('Streaming start\n');
    for (let i = 1; i <= 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      stream.enqueue(`Chunk ${i}\n`);
    }
    stream.enqueue('Streaming complete\n');
    stream.close();
  });
});
