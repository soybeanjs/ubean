import { injectHead } from '@unhead/vue';

export { injectHead } from '@unhead/vue';
export type { UseHeadInput, UseSeoMetaInput, VueHeadClient, ActiveHeadEntry, Head as HeadObject } from '@unhead/vue';

export function useHeadInstance() {
  return injectHead();
}
