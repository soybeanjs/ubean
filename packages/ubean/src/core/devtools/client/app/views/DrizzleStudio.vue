<script setup lang="ts">
import { ref } from 'vue';
import { SIcon } from '@soybeanjs/ui';

const props = defineProps<{
  studioUrl?: string;
  available?: boolean;
}>();

const iframeLoaded = ref(false);
const iframeError = ref(false);

const studioSrc = props.studioUrl || 'http://127.0.0.1:4983';

function handleLoad() {
  iframeLoaded.value = true;
  iframeError.value = false;
}

function handleError() {
  iframeError.value = true;
}

function openInNewTab() {
  window.open(studioSrc, '_blank', 'noopener,noreferrer');
}

function openDrizzleStudio() {
  window.open('https://local.drizzle.studio', '_blank', 'noopener,noreferrer');
}
</script>

<template>
  <div class="w-full h-full relative bg-background">
    <div v-if="available !== false" class="w-full h-full relative">
      <div
        v-if="!iframeLoaded && !iframeError"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs"
      >
        <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
        <span>Connecting to Drizzle Studio...</span>
        <p class="text-[12px] text-muted-foreground/70 m-0">
          Make sure
          <code class="bg-muted px-1 py-0.5 rounded font-mono text-primary text-[11px]">drizzle-kit studio</code>
          is running on port 4983
        </p>
        <button
          class="mt-2 px-3.5 py-1.5 bg-muted border border-border rounded-md text-foreground text-xs cursor-pointer transition-all hover:bg-secondary hover:border-primary"
          @click="openDrizzleStudio"
        >
          Open local.drizzle.studio →
        </button>
      </div>
      <iframe
        v-show="iframeLoaded"
        :src="studioSrc"
        class="w-full h-full border-none bg-white"
        title="Drizzle Studio"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        @load="handleLoad"
        @error="handleError"
      />
      <div
        v-if="iframeError || !available"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground px-10 py-10 text-center bg-background"
      >
        <SIcon icon="lucide:database" :size="40" class="text-muted-foreground/50" />
        <div class="text-[15px] font-semibold text-foreground">Drizzle Studio Not Connected</div>
        <div class="text-xs leading-relaxed max-w-90">
          Drizzle Studio needs to be started separately. Run the command below and refresh:
        </div>
        <pre class="bg-card border border-border px-4 py-2.5 rounded-md font-mono text-xs text-foreground my-1">
npx drizzle-kit studio</pre>
        <button
          class="mt-2 px-4.5 py-2 bg-primary border-none rounded-md text-white text-sm font-medium cursor-pointer transition-all hover:bg-primary/90"
          @click="openInNewTab"
        >
          Open in Browser ({{ studioSrc }}) →
        </button>
      </div>
    </div>
    <div
      v-else
      class="flex flex-col items-center justify-center h-full text-muted-foreground gap-3 px-10 py-10 text-center"
    >
      <SIcon icon="lucide:database" :size="40" class="text-muted-foreground/50" />
      <div class="text-[15px] font-semibold text-foreground">Database Not Configured</div>
      <div class="text-xs leading-relaxed max-w-90">
        Drizzle Studio requires a database connection. Configure
        <code class="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono text-primary">db0</code>
        or Drizzle ORM to enable.
      </div>
    </div>
  </div>
</template>
