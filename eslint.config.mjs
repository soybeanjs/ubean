import { defineConfig } from '@soybeanjs/eslint-config-vue';

export default defineConfig({
  overrides: {
    'vue/no-undef-properties': 'off',
    'vue/require-default-prop': 'off'
  }
});
