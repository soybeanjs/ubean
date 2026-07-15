import { object, pipe, string, description, optional } from 'valibot';
import { defineHandler, describeRoute, validator } from 'ubean';

const cookieSchema = object({
  session: optional(pipe(string(), description('Session ID cookie'))),
  theme: optional(pipe(string(), description('Theme preference cookie')))
});

export const GET = defineHandler(
  describeRoute({
    summary: 'Cookie validation test',
    description: 'Test endpoint for cookie validation.',
    tags: ['Testing'],
    responses: {
      200: {
        description: 'Cookies received and validated'
      },
      400: {
        description: 'Validation error'
      }
    }
  }),
  validator('cookie', cookieSchema),
  c => {
    const cookies = c.req.valid('cookie');
    return c.json({
      message: 'Cookies validated successfully',
      received: {
        session: cookies.session,
        theme: cookies.theme
      },
      timestamp: new Date().toISOString()
    });
  }
);

export const POST = defineHandler(c => {
  c.header('Set-Cookie', 'session=test-session-123; Path=/; HttpOnly');
  c.header('Set-Cookie', 'theme=dark; Path=/');
  return c.json({ message: 'Cookies set' });
});
