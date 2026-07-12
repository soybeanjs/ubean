import { h, defineComponent, ref, computed, watchEffect, onMounted, onBeforeUnmount } from 'vue';
import type { PropType } from 'vue';
import { useImage, resolveImage, getImageContext, srcSetToString, detectFormat, isDataUrl } from './runtime';
import type { ImageFormat, ImageFit, ImagePosition, ImageModifiers } from './types';

export const NuxtImg = defineComponent({
  name: 'UbeanImg',
  props: {
    src: {
      type: String as PropType<string>,
      required: true
    },
    alt: {
      type: String,
      default: ''
    },
    title: String,
    width: [String, Number],
    height: [String, Number],
    sizes: String,
    srcset: String,
    loading: {
      type: String as PropType<'lazy' | 'eager'>,
      default: 'lazy'
    },
    crossorigin: String as PropType<'' | 'anonymous' | 'use-credentials'>,
    referrerpolicy: String,
    placeholder: {
      type: [Boolean, String, Number],
      default: undefined
    },
    format: String as PropType<ImageFormat>,
    quality: [String, Number],
    fit: String as PropType<ImageFit>,
    position: String as PropType<ImagePosition>,
    background: String,
    blur: [String, Number],
    preset: String,
    provider: String,
    densities: String,
    preload: {
      type: Boolean,
      default: undefined
    },
    noModule: Boolean,
    sizesList: Array as PropType<number[]>
  },
  setup(props, { attrs }) {
    const img = useImage();
    const ctx = getImageContext();
    const isLoaded = ref(false);
    const isError = ref(false);
    const imgEl = ref<HTMLImageElement | null>(null);
    let observer: IntersectionObserver | null = null;

    const getNumber = (val: string | number | undefined): number | undefined => {
      if (val === undefined || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    const modifiers = computed<ImageModifiers>(() => ({
      width: getNumber(props.width),
      height: getNumber(props.height),
      format: props.format,
      quality: getNumber(props.quality),
      fit: props.fit,
      position: props.position,
      background: props.background,
      blur: getNumber(props.blur)
    }));

    const resolved = computed(() => {
      const opts: any = { ...modifiers.value };
      if (props.preset) opts.preset = props.preset;
      if (props.provider) opts.provider = props.provider;
      return resolveImage(props.src, opts);
    });

    const placeholderUrl = computed(() => {
      if (props.placeholder === false) return null;
      if (isDataUrl(props.src)) return null;
      const size = typeof props.placeholder === 'number' ? props.placeholder : 10;
      return img.getPlaceholder(props.src, modifiers.value, size);
    });

    const displaySrc = computed(() => {
      if (isLoaded.value || props.loading === 'eager') {
        return resolved.value.url;
      }
      return placeholderUrl.value || '';
    });

    const srcsetAttr = computed(() => {
      if (props.srcset) return props.srcset;

      const sizes = props.sizesList || (modifiers.value.width ? undefined : ctx.options.responsiveSizes);
      const densities = props.densities ? props.densities.split(',').map(Number) : undefined;

      let items: any[] = [];
      if (sizes && sizes.length > 0) {
        items = img.srcset(props.src, sizes, modifiers.value, props.format ? [props.format] : undefined);
      } else if (densities && densities.length > 0 && modifiers.value.width) {
        items = img.densitySrcset(props.src, densities, modifiers.value, props.format ? [props.format] : undefined);
      }

      return items.length > 0 ? srcSetToString(items) : undefined;
    });

    const sizesAttr = computed(() => {
      if (props.sizes) return props.sizes;
      if (!modifiers.value.width && (props.sizesList || ctx.options.responsiveSizes.length > 0)) {
        return ctx.options.screens
          ? Object.entries(ctx.options.screens)
              .reverse()
              .map(([, width], i, arr) => {
                if (i === arr.length - 1) return `${width}px`;
                return `(min-width: ${width}px) ${width}px`;
              })
              .join(', ')
          : undefined;
      }
      return undefined;
    });

    const onLoad = () => {
      isLoaded.value = true;
      isError.value = false;
    };

    const onError = () => {
      isError.value = true;
    };

    onMounted(() => {
      if (props.loading === 'eager' || !imgEl.value) {
        if (imgEl.value) {
          imgEl.value.src = resolved.value.url;
        }
        isLoaded.value = true;
        return;
      }

      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver(entries => {
          entries.forEach(entry => {
            if (entry.isIntersecting && imgEl.value) {
              imgEl.value.src = resolved.value.url;
              observer?.disconnect();
              observer = null;
            }
          });
        }, ctx.options.intersectOptions);
        observer.observe(imgEl.value);
      } else {
        if (imgEl.value) {
          imgEl.value.src = resolved.value.url;
        }
        isLoaded.value = true;
      }
    });

    onBeforeUnmount(() => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    });

    watchEffect(() => {
      if (isLoaded.value && imgEl.value && resolved.value.url) {
        imgEl.value.src = resolved.value.url;
      }
    });

    return () => {
      return h('img', {
        ...attrs,
        ref: imgEl,
        src: displaySrc.value || resolved.value.url,
        alt: props.alt,
        title: props.title,
        width: getNumber(props.width),
        height: getNumber(props.height),
        sizes: sizesAttr.value,
        srcset: srcsetAttr.value,
        loading: props.loading,
        crossorigin: props.crossorigin,
        referrerpolicy: props.referrerpolicy,
        decoding: 'async',
        onLoad,
        onError,
        'data-loaded': isLoaded.value ? '' : undefined,
        'data-error': isError.value ? '' : undefined,
        style: {
          ...(attrs.style as any),
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat'
        }
      });
    };
  }
});

export const NuxtPicture = defineComponent({
  name: 'UbeanPicture',
  props: {
    src: {
      type: String,
      required: true
    },
    alt: {
      type: String,
      default: ''
    },
    title: String,
    width: [String, Number],
    height: [String, Number],
    sizes: String,
    loading: {
      type: String as PropType<'lazy' | 'eager'>,
      default: 'lazy'
    },
    crossorigin: String,
    referrerpolicy: String,
    placeholder: [Boolean, String, Number],
    format: Array as PropType<ImageFormat[]>,
    quality: [String, Number],
    fit: String as PropType<ImageFit>,
    position: String as PropType<ImagePosition>,
    background: String,
    blur: [String, Number],
    preset: String,
    provider: String,
    densities: String,
    sizesList: Array as PropType<number[]>,
    formats: {
      type: Object as PropType<Record<string, ImageFormat[]>>,
      default: () => ({})
    }
  },
  setup(props, { attrs, slots }) {
    const img = useImage();
    const ctx = getImageContext();

    const getNumber = (val: string | number | undefined): number | undefined => {
      if (val === undefined || val === '') return undefined;
      const num = Number(val);
      return isNaN(num) ? undefined : num;
    };

    const modifiers = computed<ImageModifiers>(() => ({
      width: getNumber(props.width),
      height: getNumber(props.height),
      quality: getNumber(props.quality),
      fit: props.fit,
      position: props.position,
      background: props.background,
      blur: getNumber(props.blur)
    }));

    const fallbackFormat = computed(() => {
      const ext = detectFormat(props.src);
      return ext || 'jpeg';
    });

    const formats = computed(() => {
      if (props.format && props.format.length > 0) return props.format;
      return ctx.options.format.includes(fallbackFormat.value)
        ? ctx.options.format
        : [...ctx.options.format, fallbackFormat.value];
    });

    const sources = computed(() => {
      const sizes = props.sizesList || (modifiers.value.width ? undefined : ctx.options.responsiveSizes);
      const densities = props.densities ? props.densities.split(',').map(Number) : undefined;

      return formats.value.map(format => {
        let items: any[] = [];
        if (sizes && sizes.length > 0) {
          items = img.srcset(props.src, sizes, { ...modifiers.value, format }, [format]);
        } else if (densities && densities.length > 0 && modifiers.value.width) {
          items = img.densitySrcset(props.src, densities, { ...modifiers.value, format }, [format]);
        } else {
          const resolved = resolveImage(props.src, { ...modifiers.value, format });
          items = [{ url: resolved.url, format }];
        }

        return {
          type: `image/${format === 'jpg' ? 'jpeg' : format}`,
          srcset: srcSetToString(items)
        };
      });
    });

    const sizesAttr = computed(() => {
      if (props.sizes) return props.sizes;
      return undefined;
    });

    return () => {
      return h('picture', {}, [
        ...sources.value.map(source =>
          h('source', {
            type: source.type,
            srcset: source.srcset,
            sizes: sizesAttr.value
          })
        ),
        slots.default?.() ||
          h(NuxtImg, {
            ...attrs,
            src: props.src,
            alt: props.alt,
            title: props.title,
            width: props.width,
            height: props.height,
            sizes: props.sizes,
            loading: props.loading,
            crossorigin: props.crossorigin as any,
            referrerpolicy: props.referrerpolicy,
            placeholder: props.placeholder as any,
            quality: props.quality,
            fit: props.fit,
            position: props.position,
            background: props.background,
            blur: props.blur,
            preset: props.preset,
            provider: props.provider,
            densities: props.densities,
            sizesList: props.sizesList
          })
      ]);
    };
  }
});

export default NuxtImg;
