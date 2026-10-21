import { defineEnv, envField, useRuntimeEnv } from 'ubean';
import { defineHandler } from 'ubean/server';

// 分组糖（`server:` / `public:`）已删除：维度写在字段上。HTTP 响应里的 `server` / `public`
// 分组是**输出分组**，与 schema 写法无关。
const envResult = defineEnv({
  schema: {
    DATABASE_URL: envField.string({ context: 'server', access: 'secret', default: 'sqlite://memory' }),
    SECRET_KEY: envField.string({ context: 'server', access: 'secret', default: 'test-secret-key' }),
    PORT: envField.number({ context: 'server', access: 'public', default: 9527 }),
    API_BASE_URL: envField.string({ context: 'client', access: 'public', default: '/api' }),
    ENABLE_FEATURES: envField.boolean({ context: 'client', access: 'public', default: true })
  },
  mode: 'warn'
});

export const GET = defineHandler(c => {
  const action = c.req.query('action') || 'all';
  const env = envResult.env;

  if (action === 'server') {
    return c.json({
      action: 'server',
      databaseUrl: env.DATABASE_URL,
      secretKey: env.SECRET_KEY ? '***' : '(empty)',
      port: env.PORT
    });
  }

  if (action === 'public') {
    return c.json({
      action: 'public',
      apiBaseUrl: env.API_BASE_URL,
      enableFeatures: env.ENABLE_FEATURES
    });
  }

  if (action === 'runtime') {
    return c.json({
      action: 'runtime',
      nodeEnv: useRuntimeEnv('NODE_ENV', 'development'),
      port: useRuntimeEnv('PORT', '9527')
    });
  }

  return c.json({
    action: 'all',
    server: {
      DATABASE_URL: env.DATABASE_URL,
      SECRET_KEY: env.SECRET_KEY ? '***' : '(empty)',
      PORT: env.PORT
    },
    public: {
      API_BASE_URL: env.API_BASE_URL,
      ENABLE_FEATURES: env.ENABLE_FEATURES
    },
    types: {
      PORT: typeof env.PORT,
      ENABLE_FEATURES: typeof env.ENABLE_FEATURES
    }
  });
});
