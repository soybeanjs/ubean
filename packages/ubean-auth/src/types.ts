import type { BetterAuthOptions, Session, User, Account, Verification } from 'better-auth';

export type { BetterAuthOptions, Session, User, Account, Verification };

export interface UbeanAuthOptions {
  enabled?: boolean;
  basePath?: string;
  baseURL?: string;
  betterAuth?: Omit<BetterAuthOptions, 'baseURL' | 'basePath' | 'trustedOrigins'>;
  clientOptions?: {
    fetchOptions?: Record<string, unknown>;
    plugins?: Array<{ id: string; [key: string]: unknown }>;
  };
  redirectTo?: {
    login?: string;
    signup?: string;
    callback?: string;
  };
  session?: {
    cookieName?: string;
    expiresIn?: number;
    updateAge?: number;
  };
  socialProviders?: Record<string, SocialProviderConfig>;
}

export interface SocialProviderConfig {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
  [key: string]: unknown;
}

export interface ResolvedAuthOptions extends Required<Omit<UbeanAuthOptions, 'betterAuth' | 'socialProviders'>> {
  enabled: boolean;
  basePath: string;
  baseURL: string;
  clientOptions: {
    fetchOptions: Record<string, unknown>;
    plugins: Array<{ id: string; [key: string]: unknown }>;
  };
  redirectTo: {
    login: string;
    signup: string;
    callback: string;
  };
  session: {
    cookieName: string;
    expiresIn: number;
    updateAge: number;
  };
  betterAuth: BetterAuthOptions;
  socialProviders?: Record<string, SocialProviderConfig>;
}

export interface AuthSession {
  session: Session;
  user: User;
}

export interface AuthClient {
  signIn: (
    email: string,
    password: string,
    opts?: { callbackURL?: string }
  ) => Promise<{ data?: AuthSession; error?: AuthError }>;
  signUp: (
    email: string,
    password: string,
    name: string,
    opts?: { callbackURL?: string }
  ) => Promise<{ data?: AuthSession; error?: AuthError }>;
  signOut: () => Promise<{ data?: { success: boolean }; error?: AuthError }>;
  getSession: () => Promise<AuthSession | null>;
  signInSocial: (provider: string, opts?: { callbackURL?: string }) => Promise<void>;
  sendVerificationEmail: (
    email: string,
    opts?: { callbackURL?: string }
  ) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  resetPassword: (newPassword: string, token: string) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  forgetPassword: (
    email: string,
    opts?: { redirectTo?: string }
  ) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  updateUser: (
    data: Partial<User> & { currentPassword?: string; newPassword?: string }
  ) => Promise<{ data?: User; error?: AuthError }>;
  changeEmail: (newEmail: string, callbackURL?: string) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  changePassword: (
    currentPassword: string,
    newPassword: string,
    revokeOtherSessions?: boolean
  ) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  listSessions: () => Promise<{ data?: Session[]; error?: AuthError }>;
  revokeSession: (sessionId: string) => Promise<{ data?: { status: boolean }; error?: AuthError }>;
  revokeSessions: () => Promise<{ data?: { status: boolean }; error?: AuthError }>;
}

export interface AuthError {
  message: string;
  code?: string;
  statusCode?: number;
}

export interface UseAuthReturn {
  session: import('vue').Ref<AuthSession | null>;
  user: import('vue').ComputedRef<User | null>;
  isLoading: import('vue').Ref<boolean>;
  isAuthenticated: import('vue').ComputedRef<boolean>;
  signIn: AuthClient['signIn'];
  signUp: AuthClient['signUp'];
  signOut: AuthClient['signOut'];
  getSession: () => Promise<AuthSession | null>;
  signInSocial: AuthClient['signInSocial'];
  updateUser: AuthClient['updateUser'];
  refreshSession: () => Promise<void>;
}

export type { BetterAuthOptions as BetterAuthConfig };
