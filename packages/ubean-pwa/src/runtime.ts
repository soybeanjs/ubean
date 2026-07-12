import { ref, onMounted, computed } from 'vue';
import type { UsePwaOptions, PwaState } from './types';

let swRegistration: ServiceWorkerRegistration | null = null;

async function registerSWFn(swUrl: string, opts: UsePwaOptions = {}): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;

  const { immediate = true, onNeedRefresh, onOfflineReady, onRegistered, onRegisterError, onUpdateFound } = opts;

  if (!immediate) return null;

  try {
    const registration = await navigator.serviceWorker.register(swUrl, { scope: '/' });
    swRegistration = registration;

    onRegistered?.(swUrl);

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      onUpdateFound?.();
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            onNeedRefresh?.();
          }
        });
      }
    });

    if (!navigator.serviceWorker.controller) {
      onOfflineReady?.();
    }

    return registration;
  } catch (error) {
    onRegisterError?.(error instanceof Error ? error : new Error(String(error)));
    return null;
  }
}

export function registerSW(swUrl: string = '/sw.js', options: UsePwaOptions = {}) {
  return registerSWFn(swUrl, options);
}

export function updateSW() {
  if (swRegistration?.waiting) {
    // eslint-disable-next-line unicorn/require-post-message-target-origin
    swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
}

export function getSWRegistration() {
  return swRegistration;
}

export function usePwa(options: UsePwaOptions & { swUrl?: string } = {}) {
  const {
    immediate = true,
    swUrl = '/sw.js',
    onNeedRefresh,
    onOfflineReady,
    onRegistered,
    onRegisterError,
    onUpdateFound
  } = options;

  const isInstalled = ref(false);
  const isUpdateAvailable = ref(false);
  const isOfflineReady = ref(false);
  const needRefresh = ref(false);
  const registration = ref<ServiceWorkerRegistration | null>(null);

  const state = computed<PwaState>(() => ({
    isInstalled: isInstalled.value,
    isUpdateAvailable: isUpdateAvailable.value,
    isOfflineReady: isOfflineReady.value,
    needRefresh: needRefresh.value,
    registration: registration.value
  }));

  async function doRegister() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const reg = await registerSWFn(swUrl, {
        immediate,
        onNeedRefresh: () => {
          needRefresh.value = true;
          isUpdateAvailable.value = true;
          onNeedRefresh?.();
        },
        onOfflineReady: () => {
          isOfflineReady.value = true;
          isInstalled.value = true;
          onOfflineReady?.();
        },
        onRegistered: (url: string) => {
          registration.value = swRegistration;
          onRegistered?.(url);
        },
        onRegisterError: (err: Error) => {
          onRegisterError?.(err);
        },
        onUpdateFound: () => {
          onUpdateFound?.();
        }
      });
      if (reg) {
        registration.value = reg;
      }
    } catch {
      // silent
    }
  }

  function skipWaitingAndRefresh() {
    updateSW();
  }

  function closeNeedRefresh() {
    needRefresh.value = false;
    isUpdateAvailable.value = false;
  }

  onMounted(() => {
    if (immediate) {
      doRegister();
    }
  });

  return {
    state,
    isInstalled,
    isUpdateAvailable,
    isOfflineReady,
    needRefresh,
    registration,
    register: doRegister,
    updateServiceWorker: skipWaitingAndRefresh,
    skipWaiting: skipWaitingAndRefresh,
    closePrompt: closeNeedRefresh
  };
}
