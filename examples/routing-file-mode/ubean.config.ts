import { defineConfig } from 'ubean';

export default defineConfig({
  routing: {
    mode: 'file',
    outputDir: 'src/router/_generated',
    onGenerated(files) {
      console.log('[routing-file-mode] Generated route files:', files);
    }
  }
});
