<script setup lang="ts">
import { ref, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  open: boolean;
  initialKey?: string;
  initialValue?: string;
  isNew?: boolean;
  onSave: (key: string, value: string) => Promise<boolean>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const key = ref('');
const value = ref('');
const saving = ref(false);
const errorMsg = ref('');

watch(
  () => props.open,
  val => {
    if (val) {
      key.value = props.initialKey || '';
      value.value = props.initialValue || '';
      errorMsg.value = '';
    }
  }
);

function close() {
  if (!saving.value) emit('close');
}

async function handleSubmit() {
  if (!key.value.trim()) {
    errorMsg.value = 'Key is required';
    return;
  }
  saving.value = true;
  errorMsg.value = '';
  try {
    const success = await props.onSave(key.value.trim(), value.value);
    if (success) {
      emit('close');
    } else {
      errorMsg.value = 'Failed to save env var';
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
        class="relative bg-background border border-base rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden animate-scale-in"
      >
        <div class="flex items-center justify-between px-4 py-3 border-b border-base">
          <div class="flex items-center gap-2">
            <div class="size-7 rounded-lg bg-primary/15 flex items-center justify-center">
              <SIcon icon="lucide:terminal" :size="15" class="text-primary" />
            </div>
            <div>
              <div class="text-sm font-semibold text-foreground">
                {{ isNew ? 'Add Env Var' : 'Edit Env Var' }}
              </div>
              <div class="text-[11px] text-muted-foreground">Environment variable key/value pair</div>
            </div>
          </div>
          <button
            class="size-7 flex items-center justify-center rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="close"
          >
            <SIcon icon="lucide:x" :size="14" />
          </button>
        </div>

        <form class="p-4 space-y-3" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              Key
            </label>
            <input
              v-model="key"
              type="text"
              :disabled="!isNew"
              placeholder="DATABASE_URL"
              class="w-full px-3 py-2 bg-background border border-base rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono disabled:opacity-60 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label class="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              Value
            </label>
            <input
              v-model="value"
              type="text"
              placeholder="postgresql://..."
              class="w-full px-3 py-2 bg-background border border-base rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
            />
          </div>

          <div
            v-if="errorMsg"
            class="flex items-center gap-2 px-3 py-2 rounded-lg bg-destructive/10 text-destructive text-xs border border-destructive/20"
          >
            <SIcon icon="lucide:alert-circle" :size="13" class="flex-shrink-0" />
            {{ errorMsg }}
          </div>

          <div class="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              class="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-active transition-colors cursor-pointer"
              :disabled="saving"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              :disabled="saving || !key.trim()"
            >
              <div
                v-if="saving"
                class="size-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"
              ></div>
              <SIcon v-else icon="lucide:save" :size="12" />
              {{ saving ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
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
