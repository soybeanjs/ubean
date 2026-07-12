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

export { ubeanIslandsPlugin, transformVueSfcIslands } from './transform';
export type { UbeanIslandsPluginOptions } from './transform';

export function getIslandsBootstrapScript(): string {
  return `<script>(function(){var HYDRATED_KEY='__ubeanIslandsHydrated';function hydrated(){return !!window[HYDRATED_KEY]}function markHydrated(){window[HYDRATED_KEY]=true}function getIslands(){return document.querySelectorAll('ubean-island[data-island-id]')}function resolveProps(el){try{var d=el.getAttribute('data-props');return d?JSON.parse(d.replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<')):{}}catch(e){return{}}}function shouldHydrate(el){return el.getAttribute('data-hydrating')==='true'}function triggerHydrate(el){if(el.hasAttribute('data-hydrated'))return;el.setAttribute('data-hydrating','true')}function onDirective(el){var d=el.getAttribute('data-directive');if(!d||d==='client:only'){if(d==='client:only')triggerHydrate(el);return}if(d==='client:load'){triggerHydrate(el);return}if(d==='idle'||d==='client:idle'){if('requestIdleCallback'in window){requestIdleCallback(function(){triggerHydrate(el)},{timeout:2000});return}setTimeout(function(){triggerHydrate(el)},200);return}if(d==='visible'||d==='client:visible'){if('IntersectionObserver'in window){var io=new IntersectionObserver(function(entries){entries.forEach(function(entry){if(entry.isIntersecting){io.disconnect();triggerHydrate(el)}})},{rootMargin:'200px'});io.observe(el);return}triggerHydrate(el);return}if(d==='media'||d==='client:media'){var media=el.getAttribute('data-media');if(media){var mql=window.matchMedia(media);if(mql.matches){triggerHydrate(el)}else{var fn=function(e){if(e.matches){triggerHydrate(el);mql.removeEventListener?mql.removeEventListener('change',fn):mql.removeListener(fn)}};mql.addEventListener?mql.addEventListener('change',fn):mql.addListener(fn);return}}else{triggerHydrate(el)}return}triggerHydrate(el)}function boot(){if(hydrated())return;markHydrated();getIslands().forEach(function(el){onDirective(el)})}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',boot)}else{boot()}})();</script>`;
}

export function getIslandsClearScript(): string {
  return `(function(){function clearIslands(){var islands=document.querySelectorAll('ubean-island[data-island-id]');islands.forEach(function(el){if(el.getAttribute('data-directive')!=='client:only'){return}el.innerHTML='';el.setAttribute('data-cleared','true')})}if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',clearIslands)}else{clearIslands()}})();`;
}
