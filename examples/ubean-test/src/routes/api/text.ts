import { defineHandler, describeRoute } from 'ubean';

export const GET = defineHandler(
  describeRoute({
    summary: 'Plain text response',
    description: 'Returns a plain text response for testing responseType: "text".',
    tags: ['Test'],
    responses: {
      200: {
        description: 'Plain text content',
        content: {
          'text/plain': {
            schema: { type: 'string' }
          }
        }
      }
    }
  }),
  c => {
    return c.text('This is a plain text response from ubean!');
  }
);
