// Cross-browser body scroll lock with iOS Safari compatibility.
// On iOS, `overflow: hidden` on <body> does not prevent touch scrolling.
// The fix: set `position: fixed` on body with a negative `top` offset equal
// to the current scroll position, then restore on unlock.
//
// Usage:
//   const { lock, unlock } = useScrollLock();
//   watch(open, o => o ? lock() : unlock());
import { onUnmounted } from 'vue';

export function useScrollLock() {
  let scrollY = 0;
  let locked = false;

  function lock() {
    if (locked || typeof document === 'undefined') return;
    locked = true;
    scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow
    };
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    // Restore on unlock.
    body.dataset.scrollLockPrev = JSON.stringify(prev);
  }

  function unlock() {
    if (!locked || typeof document === 'undefined') return;
    locked = false;
    const body = document.body;
    const prev = body.dataset.scrollLockPrev;
    if (prev) {
      const { position, top, width, overflow } = JSON.parse(prev);
      body.style.position = position;
      body.style.top = top;
      body.style.width = width;
      body.style.overflow = overflow;
      delete body.dataset.scrollLockPrev;
    }
    window.scrollTo(0, scrollY);
  }

  onUnmounted(unlock);

  return { lock, unlock };
}
