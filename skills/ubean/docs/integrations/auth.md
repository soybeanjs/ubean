# Authentication

## Better Auth

### Installation

```bash
pnpm add @better-auth/core @better-auth/react
```

### Configuration

```typescript
// ubean.config.ts
import { defineConfig } from '@ubean/core';

export default defineConfig({
  auth: {
    providers: ['credentials', 'google', 'github']
  }
});
```

### Server Setup

```typescript
// src/auth/index.ts
import { betterAuth } from '@better-auth/core';
import { credentials } from '@better-auth/providers/credentials';
import { google } from '@better-auth/providers/google';

export const auth = betterAuth({
  providers: [
    credentials(),
    google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ],
  database: {
    // Database adapter
  }
});
```

### API Routes

```typescript
// src/routes/api/auth/[...better-auth].ts
import { defineEventHandler } from '@ubean/core';
import { auth } from '@/auth';

export default defineEventHandler(async (c) => {
  return auth.handleRequest(c.req, c.res);
});
```

### Client Usage

```typescript
// src/composables/useAuth.ts
import { createAuthClient } from '@better-auth/react';

export const authClient = createAuthClient({
  baseURL: '/api/auth'
});
```

```vue
<script setup lang="ts">
import { authClient } from '@/composables/useAuth';

const { signIn, signOut, session } = authClient;

const handleSignIn = async () => {
  await signIn({
    method: 'credentials',
    email: 'user@example.com',
    password: 'password'
  });
};
</script>
```

## JWT Authentication

### Installation

```bash
pnpm add jsonwebtoken
```

### Configuration

```typescript
// src/auth/jwt.ts
import jwt from 'jsonwebtoken';

const secret = process.env.JWT_SECRET || 'secret';

export const signToken = (payload: object) => {
  return jwt.sign(payload, secret, { expiresIn: '1h' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, secret);
};
```

### Login Route

```typescript
// src/routes/api/login.post.ts
import { defineEventHandler, json } from '@ubean/core';
import { signToken } from '@/auth/jwt';

export default defineEventHandler(async (c) => {
  const body = await c.req.json();
  const { email, password } = body;
  
  // Verify credentials
  const user = await verifyUser(email, password);
  
  if (!user) {
    return json({ error: 'Invalid credentials' }, { status: 401 });
  }
  
  const token = signToken({ userId: user.id });
  return json({ token });
});
```

### Middleware

```typescript
// src/middleware/auth.ts
import { defineMiddleware } from '@ubean/core';
import { verifyToken } from '@/auth/jwt';

export default defineMiddleware(async (c) => {
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.status(401).json({ error: 'Unauthorized' });
  }
  
  const token = authHeader.replace('Bearer ', '');
  
  try {
    const decoded = verifyToken(token);
    c.set('user', decoded);
  } catch {
    return c.status(401).json({ error: 'Invalid token' });
  }
});
```

## OAuth Providers

### Google

```typescript
import { google } from '@better-auth/providers/google';

export const auth = betterAuth({
  providers: [
    google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  ]
});
```

### GitHub

```typescript
import { github } from '@better-auth/providers/github';

export const auth = betterAuth({
  providers: [
    github({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET
    })
  ]
});
```

### Facebook

```typescript
import { facebook } from '@better-auth/providers/facebook';

export const auth = betterAuth({
  providers: [
    facebook({
      clientId: process.env.FACEBOOK_CLIENT_ID,
      clientSecret: process.env.FACEBOOK_CLIENT_SECRET
    })
  ]
});
```

## Session Management

### Server-Side

```typescript
import { defineEventHandler } from '@ubean/core';

export default defineEventHandler(async (c) => {
  const user = c.get('user');
  
  if (!user) {
    return c.status(401).json({ error: 'Unauthorized' });
  }
  
  return json({ user });
});
```

### Client-Side

```typescript
import { ref, onMounted } from 'vue';

const user = ref(null);

onMounted(async () => {
  const res = await fetch('/api/me');
  if (res.ok) {
    user.value = await res.json();
  }
});
```

## Password Management

### Hash Password

```typescript
import bcrypt from 'bcrypt';

const hash = await bcrypt.hash('password', 10);
```

### Verify Password

```typescript
const isValid = await bcrypt.compare('password', hash);
```

## Role-Based Access Control

### Middleware

```typescript
// src/middleware/admin.ts
import { defineMiddleware } from '@ubean/core';

export default defineMiddleware(async (c) => {
  const user = c.get('user');
  
  if (!user || user.role !== 'admin') {
    return c.status(403).json({ error: 'Forbidden' });
  }
});
```

### Route Protection

```typescript
// src/routes/api/admin/dashboard.get.ts
import { defineEventHandler } from '@ubean/core';

// This route requires admin middleware
export default defineEventHandler(() => {
  return json({ dashboard: 'admin' });
});
```

## Best Practices

1. **Use HTTPS**: Always use HTTPS in production
2. **Secure cookies**: Use HttpOnly and Secure flags
3. **Token expiration**: Set reasonable token expiration
4. **Refresh tokens**: Implement refresh token rotation
5. **Input validation**: Validate all inputs
6. **Rate limiting**: Implement rate limiting for auth endpoints
7. **Password hashing**: Use bcrypt or Argon2
8. **Session storage**: Use secure session storage
