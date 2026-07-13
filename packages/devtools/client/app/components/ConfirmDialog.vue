<script setup lang="ts">
import { ref, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  open: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const confirming = ref(false);

watch(
  () => props.open,
  val => {
    if (val) confirming.value = false;
  }
);

function handleCancel() {
  if (!confirming.value) emit('cancel');
}

async function handleConfirm() {
  confirming.value = true;
  emit('confirm');
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="handleCancel"></div>
      <div
        class="relative bg-popover border border-border rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-scale-in"
      >
        <div class="p-4 pb-3">
          <div class="flex items-start gap-3">
            <div
              class="size-9 rounded-lg flex items-center justify-center flex-shrink-0"
              :class="variant === 'danger' ? 'bg-destructive/10' : 'bg-warning/10'"
            >
              <SIcon
                icon="lucide:alert-triangle"
                :size="18"
                :class="variant === 'danger' ? 'text-destructive' : 'text-warning'"
              />
            </div>
            <div class="min-w-0">
              <div class="text-sm font-semibold text-foreground">{{ title }}</div>
              <div class="text-xs text-muted-foreground mt-1 leading-relaxed">{{ message }}</div>
            </div>
          </div>
        </div>
        <div class="flex items-center justify-end gap-2 px-4 py-3 bg-muted/30 border-t border-border">
          <button
            class="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors cursor-pointer"
            :disabled="confirming"
            @click="handleCancel"
          >
            {{ cancelText || 'Cancel' }}
          </button>
          <button
            class="px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            :class="
              variant === 'danger'
                ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
                : 'bg-warning text-warning-foreground hover:bg-warning/90'
            "
            :disabled="confirming"
            @click="handleConfirm"
          >
            <div
              v-if="confirming"
              class="size-3 border-2 border-current/30 border-t-current rounded-full animate-spin"
            ></div>
            {{ confirmText || 'Confirm' }}
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
