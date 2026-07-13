import { object, array, pipe, number, string, description } from 'valibot';
import { defineHandler, defineHandlerMeta, describeRoute, resolver, validator } from 'ubean';

const users = [
  { id: 1, name: '张三', email: 'zhangsan@example.com', role: 'admin' },
  { id: 2, name: '李四', email: 'lisi@example.com', role: 'user' },
  { id: 3, name: '王五', email: 'wangwu@example.com', role: 'user' }
];

const userSchema = object({
  id: pipe(number(), description('The unique identifier for the user')),
  name: pipe(string(), description('The name of the user')),
  email: pipe(string(), description('The email of the user')),
  role: pipe(string(), description('The role of the user'))
});

const userListResponseSchema = object({
  users: array(userSchema),
  total: pipe(number(), description('Total number of users'))
});

const createUserSchema = object({
  name: pipe(string(), description('The name of the user')),
  email: pipe(string(), description('The email of the user')),
  role: pipe(string(), description('The role of the user'))
});

export const GET = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Get all users',
    description: 'Returns a list of all users in the system.',
    tags: ['Users'],
    responses: {
      200: {
        description: 'A list of users',
        content: {
          'application/json': {
            schema: resolver(userListResponseSchema)
          }
        }
      }
    }
  }),
  c => {
    return c.json({ users, total: users.length });
  }
);

export const POST = defineHandler(
  defineHandlerMeta({ public: true }),
  describeRoute({
    summary: 'Create a new user',
    description: 'Creates a new user in the system.',
    tags: ['Users'],
    responses: {
      201: {
        description: 'The created user',
        content: {
          'application/json': {
            schema: resolver(userSchema)
          }
        }
      }
    }
  }),
  validator('json', createUserSchema),
  async c => {
    const body = c.req.valid('json');
    const newUser = {
      id: users.length + 1,
      name: body.name,
      email: body.email,
      role: body.role
    };
    users.push(newUser);
    return c.json(newUser, 201);
  }
);
