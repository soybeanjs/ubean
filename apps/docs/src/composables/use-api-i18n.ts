// Labels for the <ApiTable> renderer, i18n-aware via ubean's useI18n.
// Kept tiny: only the labels the table needs (kind names, columns, empty states).
import { computed } from 'vue';
import { useI18n } from 'ubean/runtime/vue';

export function useApiI18n() {
  const { t, locale } = useI18n();

  const labels = computed(() => {
    const isZh = locale.value === 'zh';
    return {
      name: isZh ? '名称' : 'Name',
      type: isZh ? '类型' : 'Type',
      default: isZh ? '默认值' : 'Default',
      description: isZh ? '说明' : 'Description',
      parameters: isZh ? '参数' : 'Parameters',
      returns: isZh ? '返回值' : 'Returns',
      properties: isZh ? '属性' : 'Properties',
      empty: isZh ? '暂无 API 条目。请先在仓库根目录运行 pnpm build 后再执行 pnpm build:api。' : 'No API entries. Run "pnpm build" at the repo root, then "pnpm build:api".',
      stub: isZh ? '存根数据' : 'Stub data',
      kind: {
        function: isZh ? '函数' : 'Function',
        interface: isZh ? '接口' : 'Interface',
        type: isZh ? '类型' : 'Type',
        const: isZh ? '常量' : 'Constant',
        class: isZh ? '类' : 'Class',
        enum: isZh ? '枚举' : 'Enum'
      } as Record<string, string>
    };
  });

  return { labels, t };
}
