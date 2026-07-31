/**
 * P9-20: Vite plugin for MDX compilation.
 *
 * Transforms `.mdx` files into Vue components at build time using
 * `@ubean/markdown/mdx`'s `compileMdx()`. The plugin integrates with
 * Vite's module pipeline so that `.mdx` files can be imported as
 * regular Vue components.
 *
 * When `@mdx-js/mdx` is installed, full MDX compilation (with JSX support)
 * is used. When not installed, the plugin falls back to plain markdown
 * rendering wrapped in a Vue component.
 *
 * Usage in `ubean.config.ts`:
 * The plugin is automatically enabled when `markdown.mdx: true` is set.
 */
import type { Plugin } from 'vite';
import { compileMdx } from './mdx';

export interface MdxVitePluginOptions {
  /** Additional remark plugins passed to @mdx-js/mdx. */
  remarkPlugins?: any[];
  /** Additional rehype plugins passed to @mdx-js/mdx. */
  rehypePlugins?: any[];
  /** Include pattern for MDX files. */
  include?: RegExp;
  /** Exclude pattern for MDX files. */
  exclude?: RegExp;
}

const DEFAULT_INCLUDE = /\.mdx$/;

export function ubeanMdxPlugin(options: MdxVitePluginOptions = {}): Plugin {
  const include = options.include || DEFAULT_INCLUDE;

  return {
    name: 'ubean:mdx',
    enforce: 'pre',

    async transform(code, id) {
      if (!include.test(id)) return null;
      if (options.exclude && options.exclude.test(id)) return null;

      try {
        const result = await compileMdx(code, {
          filePath: id,
          remarkPlugins: options.remarkPlugins,
          rehypePlugins: options.rehypePlugins
        });

        return {
          code: result.code,
          map: { mappings: '', version: 3, sources: [], names: [], file: id }
        };
      } catch (err) {
        this.error(`[ubean:mdx] Failed to compile ${id}: ${(err as Error).message}`);
        return null;
      }
    },

    // Mark .mdx files as transformable for HMR
    handleHotUpdate(ctx) {
      if (!include.test(ctx.file)) return;
      // Force full reload for .mdx files
      ctx.server.ws.send({ type: 'full-reload' });
      return [];
    }
  };
}
