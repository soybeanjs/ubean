export { ubeanAuthPlugin, defineAuthConfig } from './vite';

export {
  createAuthHandler,
  registerAuthRoutes,
  createAuthClient,
  getServerSession,
  resolveAuthOptions,
  DEFAULT_AUTH_OPTIONS
} from './core';

export { useAuth, getSessionFromHeaders, protectRoute } from './runtime';

export type {
  UbeanAuthOptions,
  ResolvedAuthOptions,
  SocialProviderConfig,
  AuthSession,
  AuthClient,
  AuthError,
  UseAuthReturn,
  BetterAuthConfig,
  BetterAuthOptions,
  Session,
  User,
  Account,
  Verification
} from './types';
