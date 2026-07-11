import { defineConfig } from 'vite-plus';
import { lint, fmt } from '@soybeanjs/oxc-config';

export default defineConfig(() => {
  return {
    staged: {
      '*': 'vp check --fix'
    },
    fmt: {
      ignorePatterns: ['app/typings/components.d.ts', 'app/typings/typed-router.d.ts', 'app/router/_generated'],
      ...fmt
    },
    lint,
    resolve: {
      tsconfigPaths: true
    }
  };
});
