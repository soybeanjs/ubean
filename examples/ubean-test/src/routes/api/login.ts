import { object, pipe, string, email, minLength, description } from 'valibot';
import { defineHandler, describeRoute, validator } from 'ubean';

const loginFormSchema = object({
  username: pipe(string(), minLength(3), description('Username (min 3 characters)')),
  password: pipe(string(), minLength(6), description('Password (min 6 characters)')),
  email: pipe(string(), email(), description('Email address'))
});

export const POST = defineHandler(
  describeRoute({
    summary: 'Form data validation test',
    description: 'Test endpoint for form data validation.',
    tags: ['Testing'],
    responses: {
      200: {
        description: 'Form data received and validated'
      },
      400: {
        description: 'Validation error'
      }
    }
  }),
  validator('form', loginFormSchema),
  async c => {
    const form = c.req.valid('form');
    return c.json({
      message: 'Form data validated successfully',
      received: {
        username: form.username,
        email: form.email
      },
      timestamp: new Date().toISOString()
    });
  }
);
