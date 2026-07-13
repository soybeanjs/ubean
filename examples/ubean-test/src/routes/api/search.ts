import { object, optional, pipe, number, string, integer, minValue, description, transform } from 'valibot';
import { defineHandler, describeRoute, resolver, validator } from 'ubean';

const searchQuerySchema = object({
  q: pipe(string(), description('Search query string')),
  page: optional(
    pipe(
      string(),
      transform(input => parseInt(input, 10)),
      number(),
      integer(),
      minValue(1),
      description('Page number (starts from 1)')
    )
  ),
  limit: optional(
    pipe(
      string(),
      transform(input => parseInt(input, 10)),
      number(),
      integer(),
      minValue(1),
      description('Items per page (default 10)')
    )
  )
});

const searchResponseSchema = object({
  query: pipe(string(), description('The search query used')),
  page: pipe(number(), integer(), description('Current page number')),
  limit: pipe(number(), integer(), description('Items per page')),
  results: pipe(string(), description('Sample results')),
  timestamp: pipe(string(), description('Response timestamp'))
});

export const GET = defineHandler(
  describeRoute({
    summary: 'Search with query validation',
    description: 'Test endpoint for query parameter validation.',
    tags: ['Testing'],
    responses: {
      200: {
        description: 'Search results',
        content: {
          'application/json': {
            schema: resolver(searchResponseSchema)
          }
        }
      },
      400: {
        description: 'Validation error'
      }
    }
  }),
  validator('query', searchQuerySchema),
  c => {
    const query = c.req.valid('query');
    return c.json({
      query: query.q,
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      results: `Sample results for "${query.q}"`,
      timestamp: new Date().toISOString()
    });
  }
);
