<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, shallowRef } from 'vue';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
  foldGutter,
  foldKeymap
} from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  EditorView,
  keymap,
  highlightActiveLineGutter,
  drawSelection,
  lineNumbers as cmLineNumbers
} from '@codemirror/view';

type LanguageMode = 'json' | 'javascript' | 'js' | 'vue' | 'text' | 'typescript' | 'ts';

const props = defineProps<{
  modelValue?: string;
  language?: LanguageMode;
  readonly?: boolean;
  label?: string;
  height?: string;
  theme?: 'dark' | 'light';
  lineNumbers?: boolean;
  indentUnit?: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
  focus: [];
  blur: [];
}>();

const editorContainer = ref<HTMLElement | null>(null);
const editorEl = ref<HTMLElement | null>(null);
const view = shallowRef<EditorView | null>(null);
const focused = ref(false);

const languageTag = computed(() => {
  switch (props.language) {
    case 'json':
      return 'JSON';
    case 'javascript':
    case 'js':
      return 'JS';
    case 'typescript':
    case 'ts':
      return 'TS';
    case 'vue':
      return 'Vue';
    default:
      return '';
  }
});

function getLanguageExtension() {
  switch (props.language) {
    case 'json':
      return json();
    case 'javascript':
    case 'js':
      return javascript();
    case 'typescript':
    case 'ts':
      return javascript({ typescript: true });
    case 'vue':
      return javascript();
    default:
      return [];
  }
}

function createEditorState(doc: string) {
  const extensions: unknown[] = [];
  if (props.lineNumbers !== false) {
    extensions.push(cmLineNumbers(), highlightActiveLineGutter(), foldGutter());
  }
  extensions.push(
    history(),
    drawSelection(),
    indentOnInput(),
    bracketMatching(),
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, indentWithTab]),
    getLanguageExtension(),
    EditorView.updateListener.of(update => {
      if (update.docChanged) {
        const value = update.state.doc.toString();
        emit('update:modelValue', value);
        emit('change', value);
      }
      if (update.focusChanged) {
        focused.value = update.view.hasFocus;
        if (focused.value) emit('focus');
        else emit('blur');
      }
    }),
    EditorView.theme({
      '&': {
        height: props.height || '100%',
        fontSize: '12px',
        borderRadius: '6px',
        overflow: 'hidden'
      },
      '.cm-scroller': {
        fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
        lineHeight: '1.6'
      },
      '.cm-gutters': {
        minWidth: '32px'
      }
    })
  );

  if (props.theme !== 'light') {
    extensions.push(oneDark);
  }

  if (props.readonly) {
    extensions.push(EditorState.readOnly.of(true));
  }

  extensions.push(EditorView.editable.of(!props.readonly));

  return EditorState.create({
    doc,
    extensions
  });
}

function handleFocusIn() {
  focused.value = true;
}

function handleFocusOut() {
  setTimeout(() => {
    if (view.value && !view.value.hasFocus) {
      focused.value = false;
    }
  }, 50);
}

onMounted(() => {
  if (!editorEl.value) return;
  const state = createEditorState(props.modelValue ?? '');
  view.value = new EditorView({
    state,
    parent: editorEl.value
  });
});

onBeforeUnmount(() => {
  if (view.value) {
    view.value.destroy();
    view.value = null;
  }
});

watch(
  () => props.modelValue,
  newVal => {
    if (view.value && newVal !== view.value.state.doc.toString()) {
      view.value.dispatch({
        changes: { from: 0, to: view.value.state.doc.length, insert: newVal ?? '' }
      });
    }
  }
);

watch(
  () => props.readonly,
  isReadonly => {
    if (view.value) {
      view.value.dispatch({
        effects: EditorState.readOnly.reconfigure(
          isReadonly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []
        )
      });
    }
  }
);

defineExpose({
  getEditor: () => view.value,
  focus: () => view.value?.focus(),
  getValue: () => view.value?.state.doc.toString() ?? ''
});
</script>

<template>
  <div
    ref="editorContainer"
    class="flex flex-col border border-border/50 rounded-lg overflow-hidden bg-[#1e1e2e] transition-colors"
    :class="{ 'border-primary ring-2 ring-primary/15': focused, 'is-readonly': readonly }"
  >
    <div
      v-if="label"
      class="flex items-center justify-between px-3 py-1.5 text-[11px] text-muted-foreground bg-[#1e1e2e]/80 border-b border-border/40 uppercase tracking-wider font-semibold"
    >
      <span>{{ label }}</span>
      <span
        v-if="language"
        class="text-primary bg-primary/15 px-1.5 py-0.5 rounded text-[10px] tracking-normal font-medium"
      >
        {{ languageTag }}
      </span>
    </div>
    <div
      ref="editorEl"
      class="flex-1 min-h-[100px] overflow-auto"
      @focusin="handleFocusIn"
      @focusout="handleFocusOut"
    ></div>
  </div>
</template>

<style scoped>
.is-readonly :deep(.cm-cursor) {
  display: none;
}

:deep(.cm-editor) {
  height: 100%;
}

:deep(.cm-focused) {
  outline: none;
}
</style>
