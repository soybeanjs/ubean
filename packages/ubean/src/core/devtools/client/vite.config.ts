import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import Unocss from 'unocss/vite';
import { dirname, resolve } from 'pathe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '../../../../../../');
const UNO_CONFIG_PATH = resolve(__dirname, 'uno.config.ts');

export function createDevtoolsViteConfig(rootDir: string = resolve(__dirname, 'app')) {
  return defineConfig({
    root: rootDir,
    plugins: [
      Unocss({
        configFile: UNO_CONFIG_PATH
      }),
      vue(),
      inlineAssetsPlugin()
    ],
    build: {
      outDir: resolve(PROJECT_ROOT, 'dist/devtools-client'),
      emptyOutDir: true,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      modulePreload: false,
      rollupOptions: {
        input: resolve(rootDir, 'index.html'),
        output: {
          inlineDynamicImports: true
        }
      }
    },
    define: {
      'process.env.NODE_ENV': JSON.stringify('production')
    }
  });
}

function inlineAssetsPlugin() {
  return {
    name: 'inline-devtools-assets',
    enforce: 'post' as const,
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; source?: string; code?: string; fileName: string }>
    ) {
      let jsCode = '';
      let cssCode = '';

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          cssCode += chunk.source || '';
          delete bundle[fileName];
        }
        if (chunk.type === 'chunk' && (fileName.endsWith('.js') || fileName.endsWith('.mjs'))) {
          jsCode += chunk.code || '';
          delete bundle[fileName];
        }
      }

      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type === 'asset' && fileName.endsWith('.html')) {
          let html = chunk.source as string;
          html = html.replace(/<script[^>]*src=["'][^"']*["'][^>]*><\/script>/g, '');
          html = html.replace(/<link[^>]*rel=["']stylesheet["'][^>]*>/g, '');
          if (cssCode) {
            html = html.replace('</head>', `<style>${cssCode}</style></head>`);
          }
          if (jsCode) {
            html = html.replace('</body>', `<script>${jsCode}</script></body>`);
          }
          chunk.source = html;
          chunk.fileName = 'index.html';
        }
      }
    }
  };
}

export default createDevtoolsViteConfig();
