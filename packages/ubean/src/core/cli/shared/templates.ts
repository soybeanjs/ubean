export interface TemplateVariables {
  [key: string]: unknown;
}

export interface TemplateOptions {
  variables?: Record<string, unknown>;
  delimiters?: [string, string];
}

const DEFAULT_DELIMITERS: [string, string] = ['{{', '}}'];

export function renderTemplate(template: string, options: TemplateOptions = {}): string {
  const vars = options.variables || {};
  const [open, close] = options.delimiters || DEFAULT_DELIMITERS;
  const openEsc = open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const closeEsc = close.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${openEsc}\\s*([\\w.]+)\\s*${closeEsc}`, 'g');

  return template.replace(pattern, (_match, key: string) => {
    const value = getNestedValue(vars, key);
    if (value === undefined || value === null) return `${open}${key}${close}`;
    return String(value);
  });
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export interface PageTemplateData {
  name: string;
  path: string;
  kebabName: string;
  pascalName: string;
  camelName: string;
}

export interface ApiTemplateData {
  name: string;
  method: string;
  path: string;
  kebabName: string;
}

export interface MiddlewareTemplateData {
  name: string;
  path: string;
  global: boolean;
}

export interface LayoutTemplateData {
  name: string;
  path: string;
  pascalName: string;
}

export interface CronTemplateData {
  name: string;
  schedule: string;
  kebabName: string;
}

export interface PluginTemplateData {
  name: string;
  kebabName: string;
  pascalName: string;
}

export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

export function toPascalCase(str: string): string {
  return str.replace(/[-_\s]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^(.)/, c => c.toUpperCase());
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

export const PAGE_TEMPLATE = `<script setup lang="ts">
definePage({
  meta: {
    title: '{{name}}'
  }
});
</script>

<template>
  <div>
    <div>{{name}}</div>
  </div>
</template>

`;

export const API_TEMPLATE = `import { defineHandler } from 'ubean';

export default defineHandler(async c => {
  return c.json({ message: '{{name}} endpoint' });
});
`;

export const MIDDLEWARE_TEMPLATE = `import { defineMiddleware } from 'ubean';

export default defineMiddleware(async (c, next) => {
  console.log('{{name}} middleware');
  await next();
});
`;

export const LAYOUT_TEMPLATE = `
<script setup lang="ts"></script>

<template>
  <div class="{{kebabName}}-layout">
    <slot />
  </div>
</template>
`;

export const CRON_TEMPLATE = `import { defineScheduled } from 'ubean';

export default defineScheduled({
  name: '{{name}}',
  schedule: '{{schedule}}'
}, async () => {
  console.log('Running {{name}} cron task');
});
`;

export const PLUGIN_TEMPLATE = `import { definePlugin } from 'ubean';

export default definePlugin({
  name: '{{kebabName}}',
  setup() {
    console.log('{{name}} plugin setup');
  }
});
`;

export function renderPageTemplate(data: PageTemplateData): string {
  return renderTemplate(PAGE_TEMPLATE, { variables: { ...data, kebabName: toKebabCase(data.name) } });
}

export function renderApiTemplate(data: ApiTemplateData): string {
  return renderTemplate(API_TEMPLATE, { variables: { ...data, kebabName: toKebabCase(data.name) } });
}

export function renderMiddlewareTemplate(data: MiddlewareTemplateData): string {
  return renderTemplate(MIDDLEWARE_TEMPLATE, { variables: data as unknown as Record<string, unknown> });
}

export function renderLayoutTemplate(data: LayoutTemplateData): string {
  const kebabName = toKebabCase(data.name);
  return renderTemplate(LAYOUT_TEMPLATE, { variables: { ...data, kebabName, pascalName: toPascalCase(data.name) } });
}

export function renderCronTemplate(data: CronTemplateData): string {
  return renderTemplate(CRON_TEMPLATE, { variables: { ...data, kebabName: toKebabCase(data.name) } });
}

export function renderPluginTemplate(data: PluginTemplateData): string {
  const kebabName = toKebabCase(data.name);
  return renderTemplate(PLUGIN_TEMPLATE, { variables: { ...data, kebabName, pascalName: toPascalCase(data.name) } });
}
