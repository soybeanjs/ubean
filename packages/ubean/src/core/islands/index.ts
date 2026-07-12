export type {
  ClientDirective,
  IslandDefinition,
  IslandsContext,
  ClientHydrationStrategy,
  IslandSsrOptions
} from './types';

export {
  createIslandsContext,
  registerIsland,
  getIslandsScript,
  generateIslandPlaceholder,
  renderIslandPlaceholder,
  hydrationStrategyMeta
} from './types';

export function getIslandsBootstrapScript(): string {
  return `<script>(function(){function h(){if(window.__ubeanIslandsHydrated)return;window.__ubeanIslandsHydrated=true;var s=document.querySelectorAll('ubean-island[data-island-id]');s.forEach(function(e){var d=e.dataset.directive;if(!d||d==='client:only')return;function y(){e.setAttribute('data-hydrating','true')}if(d==='client:visible'){if('IntersectionObserver'in window){var o=new IntersectionObserver(function(t){t.forEach(function(n){if(n.isIntersecting){o.disconnect();y()}})});o.observe(e);return}y()}if(d==='client:idle'){if('requestIdleCallback'in window){return requestIdleCallback(y)}return setTimeout(y,200)}if(d==='client:media'){var m=e.dataset.media;if(m){var q=window.matchMedia(m);if(!q.matches){var l=function(ev){if(ev.matches){y();q.removeEventListener?q.removeEventListener('change',l):q.removeListener(l)}};q.addEventListener?q.addEventListener('change',l):q.addListener(l);return}}y()}y()})}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',h)}else{h()}})();</script>`;
}
