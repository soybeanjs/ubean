import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 42, setupRan: false }),
  actions: {
    inc() {
      this.count++;
    }
  }
});
