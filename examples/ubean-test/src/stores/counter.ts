import { defineStore } from 'pinia';

export const useCounterStore = defineStore('counter', {
  state: () => ({ count: 42 }),
  actions: {
    inc() {
      this.count++;
    }
  }
});
