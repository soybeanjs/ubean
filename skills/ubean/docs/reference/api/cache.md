# Cache Operations

## useCache()

Access cache instance.

```typescript
import { useCache } from '@ubean/core';

const cache = useCache();
```

### Basic Operations

```typescript
// Set cache
await cache.set('user:1', { name: 'John' }, { ttl: 3600 });

// Get cache
const user = await cache.get('user:1');

// Delete cache
await cache.delete('user:1');

// Check exists
const exists = await cache.has('user:1');

// Clear all
await cache.clear();
```

## defineCache()

Define cache configuration.

```typescript
import { defineCache } from '@ubean/core';

export default defineCache({
  driver: 'redis',
  config: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD
  }
});
```

### Drivers

| Driver | Description |
|--------|-------------|
| memory | In-memory cache (default) |
| redis | Redis cache |
| memcached | Memcached cache |
| file | File-based cache |

### Options

| Option | Type | Description |
|--------|------|-------------|
| driver | string | Cache driver |
| config | object | Driver configuration |
| defaultTtl | number | Default TTL in seconds |

## TTL Configuration

```typescript
// Set with TTL
await cache.set('key', 'value', { ttl: 60 });  // 60 seconds

// Set with expiration date
const expires = new Date(Date.now() + 3600000);
await cache.set('key', 'value', { expires });

// Get remaining TTL
const ttl = await cache.ttl('key');

// Extend TTL
await cache.touch('key', 60);
```

## Cache Tags

### Set with Tags

```typescript
await cache.set('user:1', { name: 'John' }, { 
  ttl: 3600,
  tags: ['user', 'user:1']
});

await cache.set('user:2', { name: 'Jane' }, { 
  ttl: 3600,
  tags: ['user', 'user:2']
});
```

### Invalidate by Tag

```typescript
// Invalidate all items with 'user' tag
await cache.invalidateTag('user');

// Invalidate multiple tags
await cache.invalidateTags(['user', 'posts']);
```

## Cache Groups

### Define Groups

```typescript
export default defineCache({
  driver: 'redis',
  groups: {
    user: {
      ttl: 3600,
      tags: ['user']
    },
    post: {
      ttl: 7200,
      tags: ['post']
    }
  }
});
```

### Use Groups

```typescript
await cache.set('user:1', { name: 'John' }, { group: 'user' });
await cache.set('post:1', { title: 'Hello' }, { group: 'post' });

// Invalidate group
await cache.invalidateGroup('user');
```

## Cache Helpers

### remember()

Get or set cache:

```typescript
const user = await cache.remember('user:1', async () => {
  // This runs if cache miss
  const res = await fetch('/api/users/1');
  return res.json();
}, { ttl: 3600 });
```

### rememberForever()

Get or set permanent cache:

```typescript
const config = await cache.rememberForever('app:config', async () => {
  return { theme: 'dark' };
});
```

### forget()

Alias for delete:

```typescript
await cache.forget('user:1');
```

## Redis Configuration

### Basic Setup

```typescript
export default defineCache({
  driver: 'redis',
  config: {
    host: 'localhost',
    port: 6379,
    password: 'secret'
  }
});
```

### Advanced Options

```typescript
export default defineCache({
  driver: 'redis',
  config: {
    host: 'localhost',
    port: 6379,
    password: 'secret',
    db: 0,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    maxRetriesPerRequest: 2
  }
});
```

## Memory Cache

### Configuration

```typescript
export default defineCache({
  driver: 'memory',
  config: {
    max: 1000,  // Max items
    ttl: 3600   // Default TTL
  }
});
```

## File Cache

### Configuration

```typescript
export default defineCache({
  driver: 'file',
  config: {
    path: './.cache',
    ttl: 3600
  }
});
```

## Cache Events

### Subscribe to Events

```typescript
cache.on('hit', (key) => {
  console.log(`Cache hit: ${key}`);
});

cache.on('miss', (key) => {
  console.log(`Cache miss: ${key}`);
});

cache.on('set', (key, value) => {
  console.log(`Cache set: ${key}`);
});

cache.on('delete', (key) => {
  console.log(`Cache delete: ${key}`);
});
```

## Best Practices

1. **Use short TTL**: Don't cache forever
2. **Cache invalidation**: Use tags for related items
3. **Cache expensive operations**: Database queries, API calls
4. **Use remember**: Combine get and set in one call
5. **Monitor cache**: Use events for debugging
6. **Fallback**: Always have fallback for cache miss
7. **Serialize**: Complex objects are serialized automatically
