import { ref, computed, onMounted } from 'vue';
import { createAuthClient } from './core';
import type { AuthSession, AuthClient, UseAuthReturn, User, AuthError } from './types';

export function useAuth(basePath: string = '/api/auth'): UseAuthReturn {
  const client: AuthClient = createAuthClient(basePath);
  const session = ref<AuthSession | null>(null);
  const isLoading = ref(false);
  const isPending = ref(true);
  const error = ref<AuthError | null>(null);

  const user = computed<User | null>(() => session.value?.user || null);
  const isAuthenticated = computed(() => !!session.value?.user);

  async function fetchSession() {
    if (typeof window === 'undefined') return;
    isLoading.value = true;
    isPending.value = true;
    error.value = null;
    try {
      const result = await client.getSession();
      session.value = result;
    } catch (err) {
      session.value = null;
      error.value = err as AuthError;
    } finally {
      isLoading.value = false;
      isPending.value = false;
    }
  }

  const signIn = {
    email: async ({ email, password, callbackURL }: { email: string; password: string; callbackURL?: string }) => {
      isLoading.value = true;
      try {
        const result = await client.signIn.email({ email, password, callbackURL });
        if (result.data) {
          session.value = result.data;
          if (callbackURL && typeof window !== 'undefined') {
            window.location.href = callbackURL;
          }
        }
        if (result.error) error.value = result.error;
        return result;
      } finally {
        isLoading.value = false;
      }
    },
    social: (provider: string, opts?: { callbackURL?: string }) => {
      return client.signIn.social(provider, opts);
    }
  };

  const signUp = {
    email: async ({
      email,
      password,
      name,
      callbackURL
    }: {
      email: string;
      password: string;
      name: string;
      callbackURL?: string;
    }) => {
      isLoading.value = true;
      try {
        const result = await client.signUp.email({ email, password, name, callbackURL });
        if (result.data) {
          session.value = result.data;
          if (callbackURL && typeof window !== 'undefined') {
            window.location.href = callbackURL;
          }
        }
        if (result.error) error.value = result.error;
        return result;
      } finally {
        isLoading.value = false;
      }
    }
  };

  async function signOut() {
    isLoading.value = true;
    try {
      const result = await client.signOut();
      session.value = null;
      return result;
    } finally {
      isLoading.value = false;
    }
  }

  async function refreshSession() {
    await fetchSession();
  }

  onMounted(() => {
    fetchSession();

    if (typeof window !== 'undefined') {
      window.addEventListener('focus', fetchSession);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') fetchSession();
      });
    }
  });

  return {
    session,
    user,
    isLoading,
    isPending,
    isAuthenticated,
    error,
    signIn,
    signUp,
    signOut,
    getSession: client.getSession,
    updateUser: client.updateUser,
    refreshSession
  };
}

export function useSession(basePath: string = '/api/auth') {
  const data = ref<AuthSession | null>(null);
  const isPending = ref(true);
  const error = ref<AuthError | null>(null);
  const client = createAuthClient(basePath);

  const refetch = async () => {
    isPending.value = true;
    error.value = null;
    try {
      data.value = await client.getSession();
    } catch (err) {
      data.value = null;
      error.value = err as AuthError;
    } finally {
      isPending.value = false;
    }
  };

  onMounted(refetch);

  if (typeof window !== 'undefined') {
    window.addEventListener('focus', refetch);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refetch();
    });
  }

  return { data, isPending, error, refetch };
}

export function getSessionFromHeaders(headers: Headers, basePath: string = '/api/auth'): Promise<AuthSession | null> {
  return fetch(`${basePath}/get-session`, {
    headers: { cookie: headers.get('cookie') || '' },
    credentials: 'include'
  })
    .then(r => r.json())
    .then(data => {
      if (data?.session && data?.user) return data as AuthSession;
      return null;
    })
    .catch(() => null);
}

export function protectRoute(redirectTo: string = '/login') {
  const auth = useAuth();
  if (typeof window !== 'undefined' && !auth.isPending.value && !auth.isAuthenticated.value) {
    const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
    window.location.href = redirectUrl;
  }
}

export { createAuthClient };
export type { AuthClient, AuthSession, AuthError, User, UseAuthReturn };
