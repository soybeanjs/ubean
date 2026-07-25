import { h, defineComponent, ref, computed, watchEffect } from 'vue';
import type { PropType } from 'vue';
import {
  parseIconName,
  getIconSync,
  getIcon,
  generateSvg,
  fetchIconFromApi,
  resolveIconData,
  getLoadedCollection,
  getIconConfig,
  registerCollection,
  registerCollectionLoader
} from './runtime';
import type { IconifyCollection, ResolvedIconData } from './types';

export { ubeanIconPlugin, addIconCollection } from './vite';
export type { UbeanIconOptions } from './vite';
export {
  parseIconName,
  normalizeIconName,
  registerCollection,
  registerCollectionLoader,
  loadCollection,
  getIconSync,
  getIcon,
  getLoadedCollection,
  getIconData,
  resolveIconData,
  generateSvg,
  escapeHtml,
  listLoadedCollections,
  clearCollections,
  scanVueSfcForIcons,
  configureIconRuntime,
  getIconConfig,
  fetchIconFromApi,
  buildIconCssIcon,
  parseSvgToIconData,
  createCollectionFromSvgMap
} from './runtime';
export type {
  IconifyCollection,
  IconifyIconData,
  IconifyAlias,
  ResolvedIconData,
  IconCollectionLoader,
  CustomCollectionDirConfig,
  ResolvedCustomCollection
} from './types';

export interface UbeanIconProps {
  name: string;
  size?: string | number;
  color?: string;
  className?: string;
  ariaLabel?: string;
  title?: string;
  mode?: 'svg' | 'css';
  flip?: 'horizontal' | 'vertical' | 'both';
  rotate?: number | string;
  inline?: boolean;
}

export const Icon = defineComponent({
  name: 'UbeanIcon',
  props: {
    name: {
      type: String as PropType<string>,
      required: true
    },
    size: {
      type: [String, Number] as PropType<string | number>,
      default: '1em'
    },
    color: {
      type: String as PropType<string>,
      default: undefined
    },
    className: {
      type: String as PropType<string>,
      default: ''
    },
    ariaLabel: {
      type: String as PropType<string>,
      default: undefined
    },
    title: {
      type: String as PropType<string>,
      default: undefined
    },
    mode: {
      type: String as PropType<'svg' | 'css'>,
      default: 'svg'
    },
    flip: {
      type: String as PropType<'horizontal' | 'vertical' | 'both'>,
      default: undefined
    },
    rotate: {
      type: [String, Number] as PropType<string | number>,
      default: undefined
    },
    inline: {
      type: Boolean,
      default: false
    }
  },
  setup(props) {
    const svgHtml = ref<string>('');
    const isLoading = ref(false);
    const hasError = ref(false);

    const sizeValue = computed(() => (typeof props.size === 'number' ? `${props.size}px` : props.size));

    const transformStyle = computed(() => {
      const transforms: string[] = [];
      if (props.flip === 'horizontal' || props.flip === 'both') transforms.push('scaleX(-1)');
      if (props.flip === 'vertical' || props.flip === 'both') transforms.push('scaleY(-1)');
      if (props.rotate !== undefined) {
        const deg = typeof props.rotate === 'number' ? props.rotate : parseInt(props.rotate, 10);
        if (!isNaN(deg)) transforms.push(`rotate(${deg}deg)`);
      }
      return transforms.length > 0 ? transforms.join(' ') : undefined;
    });

    const sizeStyle = computed(() => ({
      width: sizeValue.value,
      height: sizeValue.value,
      display: props.inline ? 'inline-block' : 'inline-block',
      verticalAlign: props.inline ? '-0.125em' : 'middle',
      transform: transformStyle.value
    }));

    const cssClass = computed(() => {
      const parsed = parseIconName(props.name);
      if (!parsed) return props.className;
      const baseClass = `i-${parsed.collection}-${parsed.icon}`;
      return props.className ? `${baseClass} ${props.className}` : baseClass;
    });

    async function loadIconSvg() {
      if (props.mode === 'css') return;

      isLoading.value = true;
      hasError.value = false;

      try {
        let resolved: ResolvedIconData | null = getIconSync(props.name);

        if (!resolved) {
          resolved = await getIcon(props.name);
        }

        if (!resolved && getIconConfig().fallbackToApi && getIconConfig().iconifyApiEnabled) {
          const fetchedSvg = await fetchIconFromApi(props.name);
          if (fetchedSvg) {
            svgHtml.value = fetchedSvg;
            return;
          }
        }

        if (resolved) {
          const parsed = parseIconName(props.name);
          let finalResolved = resolved;

          if (parsed) {
            const collection = getLoadedCollection(parsed.collection);
            if (collection) {
              finalResolved = resolveIconData(collection, parsed.icon) ?? resolved;
            }
          }

          svgHtml.value = generateSvg(finalResolved, {
            className: props.className || undefined,
            ariaHidden: !props.ariaLabel,
            ariaLabel: props.ariaLabel,
            title: props.title
          });
        } else {
          hasError.value = true;
          svgHtml.value = '';
        }
      } catch {
        hasError.value = true;
        svgHtml.value = '';
      } finally {
        isLoading.value = false;
      }
    }

    watchEffect(() => {
      loadIconSvg();
    });

    return () => {
      if (props.mode === 'css') {
        return h('span', {
          class: cssClass.value,
          style: { ...sizeStyle.value, color: props.color },
          'aria-hidden': props.ariaLabel ? undefined : 'true',
          'aria-label': props.ariaLabel,
          role: props.ariaLabel ? 'img' : undefined
        });
      }

      if (isLoading.value || hasError.value || !svgHtml.value) {
        return h('span', {
          class: props.className,
          style: sizeStyle.value,
          'aria-hidden': 'true'
        });
      }

      return h('span', {
        class: props.className,
        style: { ...sizeStyle.value, color: props.color },
        innerHTML: svgHtml.value,
        'aria-hidden': props.ariaLabel ? undefined : 'true',
        'aria-label': props.ariaLabel,
        role: props.ariaLabel ? 'img' : undefined
      });
    };
  }
});

export function defineIconCollection(collection: IconifyCollection): IconifyCollection {
  registerCollection(collection);
  return collection;
}

export function defineIconCollectionLoader(
  prefix: string,
  loader: () => Promise<IconifyCollection>
): { prefix: string; load: () => Promise<IconifyCollection> } {
  const loaderDef = { prefix, load: loader };
  registerCollectionLoader(loaderDef);
  return loaderDef;
}

export function useIcon(name: string) {
  return {
    getSvg: async () => {
      const resolved = await getIcon(name);
      if (resolved) return generateSvg(resolved);
      if (getIconConfig().fallbackToApi) return fetchIconFromApi(name);
      return null;
    },
    getSvgSync: () => {
      const resolved = getIconSync(name);
      return resolved ? generateSvg(resolved) : null;
    }
  };
}

export default Icon;
