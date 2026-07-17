import { defineHandler, defineEnv, useRuntimeEnv } from 'ubean';

const envResult = defineEnv({
  server: {
    DATABASE_URL: { type: String, default: 'sqlite://memory' },
    SECRET_KEY: { type: String, default: 'test-secret-key' },
    PORT: { type: Number, default: 9527 }
  },
  public: {
    API_BASE_URL: { type: String, default: '/api' },
    ENABLE_FEATURES: { type: Boolean, default: true }
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
