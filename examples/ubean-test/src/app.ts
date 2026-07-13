import { defineApp } from 'ubean';

export default defineApp({
  head: {
    title: 'ubean-test',
    titleTemplate: '%s | ubean-test',
    meta: [
      { name: 'description', content: 'ubean framework functional test project' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' }
    ]
  },
  rootId: 'app'
});
