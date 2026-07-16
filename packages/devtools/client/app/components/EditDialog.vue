<script setup lang="ts">
import { ref, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import CodeEditor from './CodeEditor.vue';
import type { CrudResourceType, CrudResult } from '../composables/useRpc';

const props = defineProps<{
  open: boolean;
  filePath: string;
  resourceType: CrudResourceType;
  title?: string;
  language?: 'vue' | 'typescript' | 'ts' | 'javascript' | 'js' | 'json' | 'text';
  onRead: (type: CrudResourceType, path: string) => Promise<{ success: boolean; content?: string; error?: string }>;
  onSave: (
    type: CrudResourceType,
    options: { path?: string; content?: string }
  ) => Promise<CrudResult>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'saved'): void;
}>();

const content = ref('');
const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');

async function loadContent() {
  if (!props.filePath) return;
  loading.value = true;
  errorMsg.value = '';
  try {
    const result = await props.onRead(props.resourceType, props.filePath);
    if (result.success && result.content !== undefined) {
      content.value = result.content;
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
      content.value = '';
      errorMsg.value = '';
      void loadContent();
    }
  }
);

function close() {
  if (!saving.value) emit('close');
}

async function handleSave() {
  saving.value = true;
  errorMsg.value = '';
  try {
    const result = await props.onSave(props.resourceType, {
      path: props.filePath,
      content: content.value
    });
    if (result.success) {
      emit('saved');
      emit('close');
    } else if (result.errors?.length) {
      errorMsg.value = result.errors[0];
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to save file';
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
        class="relative bg-background border border-base rounded-xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col animate-scale-in"
        style="max-height: 85vh"
      >
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-base flex-shrink-0">
          <div class="flex items-center gap-2 min-w-0">
            <div class="size-7 rounded-lg bg-primary/15 flex items-center justify-center flex-shrink-0">
              <SIcon icon="lucide:pencil" :size="15" class="text-primary" />
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-foreground">{{ title || 'Edit File' }}</div>
              <div class="text-[11px] text-muted-foreground font-mono truncate">{{ filePath }}</div>
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
        <div class="flex-1 overflow-hidden p-4 min-h-0">
          <div v-if="loading" class="flex items-center justify-center h-full py-12">
            <div class="size-5 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
            <span class="ml-2 text-xs text-muted-foreground">Loading...</span>
          </div>
          <div v-else-if="errorMsg && !content" class="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">
            <SIcon icon="lucide:alert-circle" :size="13" class="flex-shrink-0" />
            {{ errorMsg }}
          </div>
          <CodeEditor
            v-else
            v-model="content"
            :language="language || 'typescript'"
            :height="'calc(85vh - 160px)'"
            label="Source"
          />
        </div>

        <!-- Error (when content loaded but save failed) -->
        <div v-if="errorMsg && content && !loading" class="px-4 pb-2 flex-shrink-0">
          <div class="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20">
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
            :disabled="saving || loading"
            @click="handleSave"
          >
            <div
              v-if="saving"
              class="size-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"
            ></div>
            <SIcon v-else icon="lucide:save" :size="12" />
            {{ saving ? 'Saving...' : 'Save' }}
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
