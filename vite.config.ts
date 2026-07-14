import { defineConfig } from 'vite-plus';
import { lint, fmt } from '@soybeanjs/oxc-config';

export default defineConfig(() => {
  return {
    staged: {
      '*': 'vp check --fix'
    },
    fmt: {
      ...fmt,
      ignorePatterns: ['docs']
    },
    lint,
    resolve: {
      tsconfigPaths: true
    }
  };
});
