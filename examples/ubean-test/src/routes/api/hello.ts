import { defineHandler, describeRoute } from 'ubean';

export const GET = defineHandler(
  describeRoute({
    summary: 'Hello endpoint',
    description: 'Returns a greeting message with timestamp and method.',
    tags: ['Demo'],
    responses: {
      200: {
        description: 'Greeting object',
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                timestamp: { type: 'string' },
                method: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }),
  c => {
    return c.json({
      message: 'Hello from ubean API!',
      timestamp: new Date().toISOString(),
      method: 'GET'
    });
  }
);

export const POST = defineHandler(
  describeRoute({
    summary: 'Hello POST endpoint',
    description: 'Echoes back the received body with a greeting.',
    tags: ['Demo'],
    responses: {
      200: {
        description: 'Echo response',
        content: {
          'application/json': {
            schema: { type: 'object' }
          }
        }
      }
    }
  }),
  async c => {
    const body = await c.req.json().catch(() => ({}));
    return c.json({
      message: 'POST received!',
      received: body,
      timestamp: new Date().toISOString(),
      method: 'POST'
    });
  }
);
