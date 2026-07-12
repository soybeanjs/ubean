<template>
  <div ref="editorContainer" class="ubean-code-editor" :class="{ 'is-readonly': readonly, 'is-focused': focused }">
    <div v-if="label" class="ubean-code-editor__label">
      <span>{{ label }}</span>
      <span v-if="language" class="ubean-code-editor__lang">{{ languageTag }}</span>
    </div>
    <div ref="editorEl" class="ubean-code-editor__content" @focusin="handleFocusIn" @focusout="handleFocusOut"></div>
  </div>
</template>

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

<style scoped>
.ubean-code-editor {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 8px;
  overflow: hidden;
  background: #1e1e2e;
  transition: border-color 0.15s ease;
}

.ubean-code-editor.is-focused {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.15);
}

.ubean-code-editor__label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  font-size: 11px;
  color: #94a3b8;
  background: rgba(30, 30, 46, 0.8);
  border-bottom: 1px solid rgba(148, 163, 184, 0.15);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
}

.ubean-code-editor__lang {
  color: #818cf8;
  background: rgba(99, 102, 241, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 10px;
  letter-spacing: 0;
  font-weight: 500;
}

.ubean-code-editor__content {
  flex: 1;
  min-height: 100px;
  overflow: auto;
}

.ubean-code-editor__content :deep(.cm-editor) {
  height: 100%;
}

.ubean-code-editor__content :deep(.cm-focused) {
  outline: none;
}

.ubean-code-editor.is-readonly .ubean-code-editor__content :deep(.cm-cursor) {
  display: none;
}
</style>
