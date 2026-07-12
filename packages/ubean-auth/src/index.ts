export { ubeanAuthPlugin, defineAuthConfig } from './vite';

export {
  createAuthHandler,
  createAuthClient,
  authMiddleware,
  getUser,
  getSession as getAuthSession,
  requireAuth,
  getServerSession,
  defineAuth,
  resolveAuthOptions
} from './core';

export { useAuth, useSession, getSessionFromHeaders, protectRoute } from './runtime';

export type {
  UbeanAuthOptions,
  ResolvedAuthOptions,
  SocialProviderConfig,
  AuthSession,
  AuthClient,
  AuthError,
  UseAuthReturn,
  AuthUser,
  AuthState,
  BetterAuthConfig,
  BetterAuthOptions,
  Session,
  User,
  Account,
  Verification
} from './types';
