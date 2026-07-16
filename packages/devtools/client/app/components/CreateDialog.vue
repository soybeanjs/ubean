<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { CrudResourceType, CrudResult } from '../composables/useRpc';

const props = defineProps<{
  open: boolean;
  initialType?: CrudResourceType;
  onCreate: (type: CrudResourceType, path: string, options?: { method?: string }) => Promise<CrudResult>;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const resourceType = ref<CrudResourceType>('page');
const resourcePath = ref('');
const httpMethod = ref('GET');
const creating = ref(false);
const errorMsg = ref('');

const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const typeOptions: { value: CrudResourceType; label: string; icon: string; placeholder: string }[] = [
  { value: 'page', label: 'Page', icon: 'lucide:file-text', placeholder: '/about' },
  { value: 'api', label: 'API Route', icon: 'lucide:send', placeholder: '/api/hello' },
  { value: 'middleware', label: 'Middleware', icon: 'lucide:layers', placeholder: '/auth' },
  { value: 'layout', label: 'Layout', icon: 'lucide:layout', placeholder: 'admin' },
  { value: 'cron', label: 'Cron Job', icon: 'lucide:clock', placeholder: 'daily-cleanup' }
];

const currentOption = computed(() => typeOptions.find(o => o.value === resourceType.value));

watch(
  () => props.open,
  val => {
    if (val) {
      resourceType.value = props.initialType || 'page';
      resourcePath.value = '';
      httpMethod.value = 'GET';
      errorMsg.value = '';
    }
  }
);

watch(resourceType, () => {
  errorMsg.value = '';
});

function close() {
  if (!creating.value) emit('close');
}

async function handleSubmit() {
  if (!resourcePath.value.trim()) {
    errorMsg.value = 'Path is required';
    return;
  }

  creating.value = true;
  errorMsg.value = '';

  try {
    const options = resourceType.value === 'api' ? { method: httpMethod.value } : undefined;
    const result = await props.onCreate(resourceType.value, resourcePath.value.trim(), options);

    if (result.success) {
      emit('close');
    } else if (result.errors?.length) {
      errorMsg.value = result.errors[0];
    }
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : 'Failed to create resource';
  } finally {
    creating.value = false;
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
              <SIcon :icon="currentOption?.icon || 'lucide:plus'" :size="15" class="text-primary" />
            </div>
            <div>
              <div class="text-sm font-semibold text-foreground">Create New</div>
              <div class="text-[11px] text-muted-foreground">Add a new resource to your project</div>
            </div>
          </div>
          <button
            class="size-7 flex items-center justify-center rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            @click="close"
          >
            <SIcon icon="lucide:x" :size="14" />
          </button>
        </div>

        <form class="p-4 space-y-4" @submit.prevent="handleSubmit">
          <div>
            <label class="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              Resource Type
            </label>
            <div class="grid grid-cols-5 gap-1.5">
              <button
                v-for="opt in typeOptions"
                :key="opt.value"
                type="button"
                class="flex flex-col items-center gap-1 py-2 px-1 rounded-lg border transition-all cursor-pointer"
                :class="
                  resourceType === opt.value
                    ? 'border-active bg-active text-foreground'
                    : 'border-base bg-background text-muted-foreground hover:text-foreground hover:bg-active'
                "
                @click="resourceType = opt.value"
              >
                <SIcon :icon="opt.icon" :size="16" />
                <span class="text-[10px] font-medium">{{ opt.label }}</span>
              </button>
            </div>
          </div>

          <div v-if="resourceType === 'api'">
            <label class="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              HTTP Method
            </label>
            <div class="flex gap-1.5">
              <button
                v-for="m in httpMethods"
                :key="m"
                type="button"
                class="px-3 py-1.5 rounded-md text-xs font-mono font-semibold border transition-all cursor-pointer"
                :class="
                  httpMethod === m
                    ? 'border-active bg-active text-foreground'
                    : 'border-base bg-background text-muted-foreground hover:text-foreground hover:bg-active'
                "
                @click="httpMethod = m"
              >
                {{ m }}
              </button>
            </div>
          </div>

          <div>
            <label class="block text-[11px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">
              {{ resourceType === 'cron' ? 'Name' : 'Path' }}
            </label>
            <input
              v-model="resourcePath"
              type="text"
              :placeholder="currentOption?.placeholder"
              class="w-full px-3 py-2 bg-background border border-base rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-active focus:ring-1 focus:ring-primary-500/25 transition-all font-mono"
              @keydown.enter="handleSubmit"
            />
            <p v-if="resourceType === 'layout'" class="mt-1 text-[10px] text-muted-foreground">
              Layout name without extension (e.g. "admin" → layouts/admin.vue)
            </p>
            <p v-else-if="resourceType === 'cron'" class="mt-1 text-[10px] text-muted-foreground">
              Cron job file name (e.g. "daily" → server/crons/daily.ts)
            </p>
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
              :disabled="creating"
              @click="close"
            >
              Cancel
            </button>
            <button
              type="submit"
              class="px-4 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              :disabled="creating || !resourcePath.trim()"
            >
              <div
                v-if="creating"
                class="size-3 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin"
              ></div>
              <SIcon v-else icon="lucide:plus" :size="12" />
              {{ creating ? 'Creating...' : 'Create' }}
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
