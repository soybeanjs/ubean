<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { CrudResourceType, CrudResult } from '../composables/useRpc';
import CodeEditor from './CodeEditor.vue';

/**
 * Form-based editor for the `definePage({...})` macro inside a `.vue` page.
 *
 * Scalar fields (name / path / layout / reuse / middleware / requiresAuth)
 * are exposed as native inputs. Complex fields (meta) are edited as
 * JSON via CodeEditor. On save, the dialog rebuilds the `definePage({...})`
 * call and patches the source file in-place — preserving everything outside
 * the macro call.
 */

interface PageMetaForm {
  name: string;
  path: string;
  layout: string; // '' = inherit default; 'false' = no layout; otherwise layout name
  reuse: string;
  middleware: string; // comma-separated → string | string[]
  requiresAuth: boolean;
  meta: string; // JSON string
}

const props = defineProps<{
  open: boolean;
  filePath: string;
  pagePath: string;
  onRead: (type: CrudResourceType, path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  onSave: (type: CrudResourceType, options: { path?: string; content?: string }) => Promise<CrudResult>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');
const metaError = ref('');
const rawContent = ref('');
const hasDefinePage = ref(false);

const form = ref<PageMetaForm>(emptyForm());

function emptyForm(): PageMetaForm {
  return {
    name: '',
    path: '',
    layout: '',
    reuse: '',
    middleware: '',
    requiresAuth: false,
    meta: ''
  };
}

// --- Client-side parser (ported & simplified from ubean's define-page.ts) ---

function extractScriptContent(code: string): string | null {
  // NOTE: build the regex from concatenated parts so the SFC parser does not
  // see a literal closing-script tag inside this script block.
  // oxlint-disable-next-line no-useless-concat
  const openTag = '<scr' + 'ipt';
  // oxlint-disable-next-line no-useless-concat
  const closeTag = '</scr' + 'ipt>';
  if (!code.includes(openTag)) return code;
  const scriptRegex = new RegExp(`${openTag}([^>]*)>([\\s\\S]*?)${closeTag}`, 'g');
  let match: RegExpExecArray | null;
  let fallback = '';
  while ((match = scriptRegex.exec(code)) !== null) {
    const attrs = match[1] || '';
    const content = match[2] || '';
    if (attrs.includes('setup')) return content;
    fallback += `${content}\n`;
  }
  return fallback || null;
}

/** Find the balanced argument string of `funcName(...)` starting from `from`. */
function findBalancedCall(
  code: string,
  funcName: string,
  from = 0
): { start: number; argStart: number; end: number; arg: string } | null {
  const re = new RegExp(`\\b${funcName}\\s*\\(`, 'g');
  re.lastIndex = from;
  const m = re.exec(code);
  if (!m) return null;
  const argStart = m.index + m[0].length;
  let depth = 1;
  let i = argStart;
  let inStr: string | null = null;
  let escaped = false;
  while (i < code.length && depth > 0) {
    const ch = code[i];
    if (escaped) {
      escaped = false;
      i++;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      i++;
      continue;
    }
    if (inStr) {
      if (ch === inStr) inStr = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
      i++;
      continue;
    }
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') {
      depth--;
      if (depth === 0 && ch === ')') {
        return { start: m.index, argStart, end: i + 1, arg: code.slice(argStart, i) };
      }
    }
    i++;
  }
  return null;
}

/** Very small JS object-literal evaluator for the definePage arg.
 *  Handles: strings, booleans, numbers, arrays of strings, nested objects (via JSON-ish). */
function evalArg(arg: string): Record<string, unknown> | null {
  const trimmed = arg.trim();
  if (!trimmed.startsWith('{')) return null;
  // Wrap in parens to evaluate as expression. We use Function for a best-effort parse.
  try {
    const fn = new Function(`return (${trimmed});`);
    const val = fn();
    if (val && typeof val === 'object' && !Array.isArray(val)) return val as Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function parseMetaFromContent(code: string): { meta: PageMetaForm; found: boolean } {
  const script = extractScriptContent(code);
  if (!script) return { meta: emptyForm(), found: false };
  const call = findBalancedCall(script, 'definePage');
  if (!call) return { meta: emptyForm(), found: false };
  const parsed = evalArg(call.arg);
  if (!parsed) return { meta: emptyForm(), found: false };

  const f = emptyForm();
  if (typeof parsed.name === 'string') f.name = parsed.name;
  if (typeof parsed.path === 'string') f.path = parsed.path;
  if (parsed.layout === false) f.layout = 'false';
  else if (typeof parsed.layout === 'string') f.layout = parsed.layout;
  if (typeof parsed.reuse === 'string') f.reuse = parsed.reuse;
  if (typeof parsed.middleware === 'string') f.middleware = parsed.middleware;
  else if (Array.isArray(parsed.middleware))
    f.middleware = parsed.middleware.filter((x): x is string => typeof x === 'string').join(', ');
  if (typeof parsed.requiresAuth === 'boolean') f.requiresAuth = parsed.requiresAuth;
  if (parsed.meta && typeof parsed.meta === 'object') {
    try {
      f.meta = JSON.stringify(parsed.meta, null, 2);
    } catch {
      /* ignore */
    }
  }
  return { meta: f, found: true };
}

// --- Serialization back to source ---

function buildDefinePageCall(f: PageMetaForm): string {
  const lines: string[] = [];
  if (f.name.trim()) lines.push(`  name: ${JSON.stringify(f.name.trim())}`);
  if (f.path.trim()) lines.push(`  path: ${JSON.stringify(f.path.trim())}`);
  if (f.layout === 'false') lines.push(`  layout: false`);
  else if (f.layout.trim()) lines.push(`  layout: ${JSON.stringify(f.layout.trim())}`);
  if (f.reuse.trim()) lines.push(`  reuse: ${JSON.stringify(f.reuse.trim())}`);

  const mw = f.middleware.trim();
  if (mw) {
    const parts = mw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 1) lines.push(`  middleware: ${JSON.stringify(parts[0])}`);
    else if (parts.length > 1) lines.push(`  middleware: ${JSON.stringify(parts)}`);
  }
  if (f.requiresAuth) lines.push(`  requiresAuth: true`);

  if (f.meta.trim()) {
    lines.push(`  meta: ${f.meta.trim()}`);
  }
  return `definePage({\n${lines.join(',\n')}\n})`;
}

function patchSource(original: string, newCall: string): string {
  const script = extractScriptContent(original);
  // No script block (e.g. pure markdown) — prepend a script setup block.
  // NOTE: split the closing tag to avoid breaking the Vue SFC parser.
  // oxlint-disable-next-line no-useless-concat
  const CLOSE_TAG = '</scr' + 'ipt>';
  // oxlint-disable-next-line no-useless-concat
  const OPEN_TAG = '<scr' + 'ipt setup lang="ts">';
  if (script === null) {
    return `${OPEN_TAG}\n${newCall}\n${CLOSE_TAG}\n\n${original}`;
  }
  const call = findBalancedCall(script, 'definePage');
  if (!call) {
    // Inject definePage at end of the script setup block. We locate the
    // closing tag and insert before it.
    const closeIdx = original.lastIndexOf(CLOSE_TAG);
    if (closeIdx === -1) return original;
    const before = original.slice(0, closeIdx);
    const after = original.slice(closeIdx);
    const sep = before.endsWith('\n') ? '' : '\n';
    return `${before}${sep}${newCall}\n${after}`;
  }
  // Replace existing call (only within the script content region). We rebuild
  // the whole file by scanning the original for the first `definePage(`
  // occurrence and replacing its balanced call.
  const fileCall = findBalancedCall(original, 'definePage');
  if (!fileCall) return original;
  return original.slice(0, fileCall.start) + newCall + original.slice(fileCall.end);
}

// --- Load / save ---

async function loadContent() {
  if (!props.filePath) return;
  loading.value = true;
  errorMsg.value = '';
  metaError.value = '';
  try {
    const result = await props.onRead('page', props.filePath);
    if (result.success && result.content !== undefined) {
      rawContent.value = result.content;
      const { meta, found } = parseMetaFromContent(result.content);
      form.value = meta;
      hasDefinePage.value = found;
    } else {
      errorMsg.value = result.error || 'Failed to load file';
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to load file';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  val => {
    if (val) {
      form.value = emptyForm();
      rawContent.value = '';
      hasDefinePage.value = false;
      void loadContent();
    }
  }
);

const canSave = computed(() => !loading.value && !saving.value && !errorMsg.value);

function close() {
  if (!saving.value) emit('close');
}

function validateJsonFields(): boolean {
  metaError.value = '';
  if (form.value.meta.trim()) {
    try {
      JSON.parse(form.value.meta.trim());
    } catch (e) {
      metaError.value = e instanceof Error ? e.message : 'Invalid JSON';
    }
  }
  return !metaError.value;
}

async function handleSave() {
  if (!validateJsonFields()) return;
  saving.value = true;
  errorMsg.value = '';
  try {
    const newCall = buildDefinePageCall(form.value);
    const next = patchSource(rawContent.value, newCall);
    const result = await props.onSave('page', { path: props.filePath, content: next });
    if (result.success) {
      emit('saved');
      emit('close');
    } else if (result.errors?.length) {
      errorMsg.value = result.errors[0];
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to save';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="close"></div>
      <div
        class="relative bg-background border border-base rounded-xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden flex flex-col animate-scale-in"
        style="max-height: 85vh"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-base flex-shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <SIcon icon="lucide:sliders-horizontal" :size="15" class="text-primary" />
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-foreground">Page Properties</div>
              <div class="text-[11px] text-muted-foreground font-mono truncate">{{ pagePath }} · {{ filePath }}</div>
            </div>
          </div>
          <button
            class="size-7 flex items-center justify-center rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
            @click="close"
          >
            <SIcon icon="lucide:x" :size="14" />
          </button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-4 min-h-0">
          <div v-if="loading" class="flex items-center justify-center h-full py-12">
            <div class="size-5 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
            <span class="ml-2 text-xs text-muted-foreground">Loading...</span>
          </div>

          <div
            v-else-if="errorMsg && !rawContent"
            class="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20"
          >
            <SIcon icon="lucide:alert-circle" :size="13" class="flex-shrink-0" />
            {{ errorMsg }}
          </div>

          <div v-else class="flex flex-col gap-4">
            <!-- Notice when no definePage yet -->
            <div
              v-if="!hasDefinePage"
              class="flex items-start gap-2 p-2.5 rounded-lg bg-info/10 text-info text-xs border border-info/20"
            >
              <SIcon icon="lucide:info" :size="13" class="flex-shrink-0 mt-0.5" />
              <span>
                No
                <code class="font-mono">definePage()</code>
                call detected. Saving will add one to the &lt;script setup&gt; block.
              </span>
            </div>

            <!-- Scalar fields grid -->
            <div class="grid grid-cols-2 gap-3">
              <label class="flex flex-col gap-1">
                <span class="text-2xs text-muted-foreground font-medium">Name</span>
                <input
                  v-model="form.name"
                  type="text"
                  placeholder="route name"
                  class="px-2.5 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-2xs text-muted-foreground font-medium">Path Override</span>
                <input
                  v-model="form.path"
                  type="text"
                  placeholder="/custom/path"
                  class="px-2.5 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-2xs text-muted-foreground font-medium">Layout</span>
                <input
                  v-model="form.layout"
                  type="text"
                  placeholder="default (empty) / name / false"
                  class="px-2.5 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
                />
              </label>
              <label class="flex flex-col gap-1">
                <span class="text-2xs text-muted-foreground font-medium">Reuse</span>
                <input
                  v-model="form.reuse"
                  type="text"
                  placeholder="reuse key"
                  class="px-2.5 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
                />
              </label>
              <label class="flex flex-col gap-1 col-span-2">
                <span class="text-2xs text-muted-foreground font-medium">Middleware (comma-separated)</span>
                <input
                  v-model="form.middleware"
                  type="text"
                  placeholder="auth, admin"
                  class="px-2.5 py-1.5 bg-background border border-base rounded-md text-xs text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
                />
              </label>
              <label class="flex items-center gap-2 col-span-2 cursor-pointer">
                <input v-model="form.requiresAuth" type="checkbox" class="size-3.5 accent-primary cursor-pointer" />
                <span class="text-xs text-foreground">Requires Auth</span>
                <span class="text-2xs text-muted-foreground">(redirect unauthenticated users)</span>
              </label>
            </div>

            <!-- Complex fields -->
            <div class="flex flex-col gap-1.5">
              <div class="flex items-center justify-between">
                <span class="text-2xs text-muted-foreground font-medium">Meta (JSON object)</span>
                <span v-if="metaError" class="text-2xs text-destructive">{{ metaError }}</span>
              </div>
              <CodeEditor v-model="form.meta" language="json" height="120px" :line-numbers="false" label="meta" />
            </div>
          </div>
        </div>

        <!-- Save error -->
        <div v-if="errorMsg && rawContent && !loading" class="px-4 pb-2 flex-shrink-0">
          <div
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20"
          >
            <SIcon icon="lucide:alert-circle" :size="13" class="flex-shrink-0" />
            {{ errorMsg }}
          </div>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 px-4 py-3 bg-secondary border-t border-base flex-shrink-0">
          <button
            type="button"
            class="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-active transition-colors cursor-pointer"
            :disabled="saving"
            @click="close"
          >
            Cancel
          </button>
          <button
            type="button"
            class="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            :disabled="!canSave"
            @click="handleSave"
          >
            <div
              v-if="saving"
              class="size-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"
            ></div>
            <SIcon v-else icon="lucide:save" :size="12" />
            {{ saving ? 'Saving...' : 'Save Properties' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes scale-in {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
.animate-scale-in {
  animation: scale-in 0.15s ease-out;
}
</style>
