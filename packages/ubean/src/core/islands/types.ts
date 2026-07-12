export type ClientDirective = 'client:load' | 'client:idle' | 'client:visible' | 'client:media' | 'client:only';

export interface IslandDefinition {
  id: string;
  component: string;
  directive: ClientDirective;
  mediaQuery?: string;
  props: Record<string, unknown>;
  slots?: Record<string, string>;
}

export interface IslandsContext {
  islands: Map<string, IslandDefinition>;
  counter: number;
}

export interface ClientHydrationStrategy {
  directive: ClientDirective;
}

export interface IslandSsrOptions {
  component: string;
  directive: ClientDirective;
  props?: Record<string, unknown>;
  mediaQuery?: string;
  children?: string;
}

export function createIslandsContext(): IslandsContext {
  return {
    islands: new Map(),
    counter: 0
  };
}

export function registerIsland(
  ctx: IslandsContext,
  component: string,
  directive: ClientDirective,
  props: Record<string, unknown>,
  mediaQuery?: string
): string {
  const id = `island-${++ctx.counter}`;
  ctx.islands.set(id, {
    id,
    component,
    directive,
    mediaQuery,
    props: serializeProps(props)
  });
  return id;
}

function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value === 'function' || typeof value === 'symbol') {
      continue;
    }
    result[key] = value;
  }
  return result;
}

export function getIslandsScript(islands: IslandDefinition[]): string {
  if (islands.length === 0) return '';

  return `<script type="application/json" data-ubean-islands>${JSON.stringify(islands)}</script>`;
}

export function generateIslandPlaceholder(
  id: string,
  component: string,
  directive: ClientDirective,
  props: Record<string, unknown>,
  renderedHtml: string,
  mediaQuery?: string
): string {
  const propsJson = JSON.stringify(serializeProps(props));
  const mediaAttr = mediaQuery ? ` data-media="${escapeHtml(mediaQuery)}"` : '';

  return `<ubean-island
  data-island-id="${escapeHtml(id)}"
  data-component="${escapeHtml(component)}"
  data-directive="${directive}"${mediaAttr}
  data-props="${escapeHtml(propsJson)}"
>${renderedHtml}</ubean-island>`;
}

export function renderIslandPlaceholder(options: IslandSsrOptions): string {
  const { component, directive, props = {}, mediaQuery, children = '' } = options;
  const id = `island-${Math.random().toString(36).slice(2, 10)}`;
  return generateIslandPlaceholder(id, component, directive, props, children, mediaQuery);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const hydrationStrategyMeta: Record<
  ClientDirective,
  { directive: ClientDirective; requiresMediaQuery?: boolean }
> = {
  'client:load': { directive: 'client:load' },
  'client:idle': { directive: 'client:idle' },
  'client:visible': { directive: 'client:visible' },
  'client:media': { directive: 'client:media', requiresMediaQuery: true },
  'client:only': { directive: 'client:only' }
};
