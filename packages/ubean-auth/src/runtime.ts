import { ref, computed, onMounted } from 'vue';
import { createAuthClient } from './core';
import type { AuthSession, AuthClient, UseAuthReturn, User } from './types';

export function useAuth(basePath: string = '/api/auth'): UseAuthReturn {
  const client: AuthClient = createAuthClient(basePath);
  const session = ref<AuthSession | null>(null);
  const isLoading = ref(false);

  const user = computed<User | null>(() => session.value?.user || null);
  const isAuthenticated = computed(() => !!session.value?.user);

  async function fetchSession() {
    if (typeof window === 'undefined') return;
    isLoading.value = true;
    try {
      const result = await client.getSession();
      session.value = result;
    } catch {
      session.value = null;
    } finally {
      isLoading.value = false;
    }
  }

  async function signIn(email: string, password: string, opts?: { callbackURL?: string }) {
    isLoading.value = true;
    try {
      const result = await client.signIn(email, password, opts);
      if (result.data) {
        session.value = result.data;
        if (opts?.callbackURL) {
          window.location.href = opts.callbackURL;
        }
      }
      return result;
    } finally {
      isLoading.value = false;
    }
  }

  async function signUp(email: string, password: string, name: string, opts?: { callbackURL?: string }) {
    isLoading.value = true;
    try {
      const result = await client.signUp(email, password, name, opts);
      if (result.data) {
        session.value = result.data;
        if (opts?.callbackURL) {
          window.location.href = opts.callbackURL;
        }
      }
      return result;
    } finally {
      isLoading.value = false;
    }
  }

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
    isAuthenticated,
    signIn,
    signUp,
    signOut,
    getSession: client.getSession,
    signInSocial: client.signInSocial,
    updateUser: client.updateUser,
    refreshSession
  };
}

export function getSessionFromHeaders(headers: Headers, basePath: string = '/api/auth'): Promise<AuthSession | null> {
  return fetch(`${basePath}/session`, {
    headers: { cookie: headers.get('cookie') || '' }
  })
    .then(r => r.json())
    .then(data => {
      if (data?.session && data?.user) return data as AuthSession;
      return null;
    })
    .catch(() => null);
}

export function protectRoute(redirectTo: string = '/login') {
  const { isAuthenticated, isLoading } = useAuth();
  if (typeof window !== 'undefined' && !isLoading.value && !isAuthenticated.value) {
    const redirectUrl = `${redirectTo}?redirect=${encodeURIComponent(window.location.pathname)}`;
    window.location.href = redirectUrl;
  }
}
