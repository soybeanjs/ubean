/**
 * Server-side auth API.
 *
 * NOTE: the Vite plugin (`ubeanAuthPlugin`) is NOT re-exported here — import
 * it from the `@ubean/auth/vite` subpath. `createAuthClient` lives in the
 * browser-safe `./client` module (no `node:` imports).
 */
export {
  createAuthHandler,
  authMiddleware,
  getUser,
  getSession as getAuthSession,
  requireAuth,
  getServerSession,
  defineAuth,
  resolveAuthOptions
} from './core';

export { createAuthClient } from './client';

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
