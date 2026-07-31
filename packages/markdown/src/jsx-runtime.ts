/**
 * P9-20: Vue JSX runtime for MDX compilation.
 *
 * MDX compiles to JavaScript modules that use a JSX runtime
 * (`jsx()`, `jsxs()`, `Fragment`). This module provides a Vue-compatible
 * runtime that maps these calls to Vue's `h()` function, allowing MDX
 * content to render as Vue components.
 *
 * When `@mdx-js/mdx` compiles MDX with `jsxImportSource: '@ubean/markdown/jsx-runtime'`,
 * the output imports from this module.
 */
import { h, Fragment } from 'vue';
import type { VNode, Component } from 'vue';

export { Fragment };

/**
 * Create a Vue VNode from a JSX-like call.
 * Maps MDX's `jsx(type, props)` to Vue's `h(type, props)`.
 */
export function jsx(type: string | Component, props: Record<string, any> | null, key?: string | number): VNode {
  const { children, ...rest } = props || {};
  const vueProps: Record<string, any> = { ...rest };
  if (key !== undefined) {
    vueProps.key = key;
  }
  if (children !== undefined) {
    return h(type as any, vueProps, children);
  }
  return h(type as any, vueProps);
}

/**
 * Create a Vue VNode with multiple children (same as jsx for Vue).
 */
export function jsxs(type: string | Component, props: Record<string, any> | null, key?: string | number): VNode {
  return jsx(type, props, key);
}
