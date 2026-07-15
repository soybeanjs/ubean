import { object, pipe, string, description, optional } from 'valibot';
import { defineHandler, describeRoute, validator } from 'ubean';

const headersSchema = object({
  'x-request-id': optional(pipe(string(), description('Request ID header'))),
  'x-custom-header': optional(pipe(string(), description('A custom test header')))
});

export const GET = defineHandler(
  describeRoute({
    summary: 'Test header validation',
    description: 'Test endpoint for header validation.',
    tags: ['Testing'],
    responses: {
      200: {
        description: 'Headers received and validated'
      },
      400: {
        description: 'Validation error'
      }
    }
  }),
  validator('header', headersSchema),
  c => {
    const headers = c.req.valid('header');
    return c.json({
      message: 'Headers validated successfully',
      received: {
        requestId: headers['x-request-id'],
        customHeader: headers['x-custom-header']
      },
      timestamp: new Date().toISOString()
    });
  }
);
