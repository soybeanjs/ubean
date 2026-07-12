<script setup lang="ts">
import { ref, nextTick, onMounted, computed } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { AiChatMessage, AiChatResponse } from '../composables/useRpc';

const props = defineProps<{
  info: {
    ai?: { enabled: boolean; provider?: string; model?: string };
  };
  sendChat: (
    messages: AiChatMessage[],
    options: { apiKey?: string; apiBase?: string; model?: string }
  ) => Promise<AiChatResponse>;
  onRefresh: () => Promise<void>;
}>();

const messages = ref<AiChatMessage[]>([]);
const input = ref('');
const isLoading = ref(false);
const messagesEl = ref<HTMLElement | null>(null);
const showSettings = ref(false);
const apiKey = ref(localStorage.getItem('ubean_ai_api_key') || '');
const apiBase = ref(localStorage.getItem('ubean_ai_api_base') || '');
const model = ref(localStorage.getItem('ubean_ai_model') || '');

const aiEnabled = computed(() => props.info?.ai?.enabled || !!apiKey.value);
const hasApiKey = computed(() => !!apiKey.value || !!props.info?.ai?.enabled);

const suggestions = [
  { text: 'List all pages', icon: 'lucide:file-text' },
  { text: 'Create an API route', icon: 'lucide:send' },
  { text: 'Show environment variables', icon: 'lucide:key' },
  { text: 'Create a page /about', icon: 'lucide:plus' }
];

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight;
    }
  });
}

function saveSettings() {
  if (apiKey.value) localStorage.setItem('ubean_ai_api_key', apiKey.value);
  else localStorage.removeItem('ubean_ai_api_key');
  if (apiBase.value) localStorage.setItem('ubean_ai_api_base', apiBase.value);
  else localStorage.removeItem('ubean_ai_api_base');
  if (model.value) localStorage.setItem('ubean_ai_model', model.value);
  else localStorage.removeItem('ubean_ai_model');
  showSettings.value = false;
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  const paramStr = Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(', ');
  return `${name}(${paramStr})`;
}

function formatToolResult(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'object') {
    const r = result as Record<string, unknown>;
    if (r.success === false && r.errors) {
      return `❌ ${(r.errors as string[]).join(', ')}`;
    }
    if (r.created && Array.isArray(r.created)) {
      return `✅ Created: ${(r.created as string[]).join(', ')}`;
    }
    if (r.deleted && Array.isArray(r.deleted)) {
      return `🗑️ Deleted: ${(r.deleted as string[]).join(', ')}`;
    }
    if (r.updated && Array.isArray(r.updated)) {
      return `📝 Updated: ${(r.updated as string[]).join(', ')}`;
    }
    if (r.data && typeof r.data === 'object') {
      const entries = Object.entries(r.data as Record<string, unknown>).slice(0, 10);
      return entries.map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join('\n');
    }
    if (r.content && typeof r.content === 'string') {
      return r.content.slice(0, 300);
    }
    return JSON.stringify(result, null, 2).slice(0, 300);
  }
  return String(result);
}

async function sendMessage(text?: string) {
  const content = (text ?? input.value).trim();
  if (!content || isLoading.value) return;

  const userMsg: AiChatMessage = {
    role: 'user',
    content,
    timestamp: Date.now()
  };
  messages.value.push(userMsg);
  input.value = '';
  isLoading.value = true;
  scrollToBottom();

  try {
    const opts: { apiKey?: string; apiBase?: string; model?: string } = {};
    if (apiKey.value) opts.apiKey = apiKey.value;
    if (apiBase.value) opts.apiBase = apiBase.value;
    if (model.value) opts.model = model.value;

    const response = await props.sendChat([...messages.value], opts);

    messages.value.push(response.message);

    if (response.toolResults && response.toolResults.length > 0) {
      response.message.toolResults = response.toolResults;
      await props.onRefresh();
    }
  } catch (e) {
    messages.value.push({
      role: 'assistant',
      content: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      timestamp: Date.now()
    });
  } finally {
    isLoading.value = false;
    scrollToBottom();
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

onMounted(() => {
  messages.value = [
    {
      role: 'assistant',
      content: `👋 Hi! I'm your ubean AI assistant. I can help you manage your project:\n\n• **Create resources**: pages, APIs, layouts, middleware, cron jobs, plugins\n• **Inspect project**: list routes, pages, env vars, config\n• **Manage env**: set/get/remove environment variables\n\n${hasApiKey.value ? 'You have AI configured — I can understand natural language commands!' : 'Set up your API key in settings to enable full AI chat, or use simple text commands like "create page about"'}`,
      timestamp: Date.now()
    }
  ];
});
</script>

<template>
  <div class="flex flex-col h-full bg-background">
    <div class="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-card/50">
      <div class="flex items-center gap-2">
        <SIcon icon="lucide:sparkles" :size="14" class="text-primary" />
        <span class="text-xs font-semibold text-foreground">AI Assistant</span>
        <span
          v-if="aiEnabled"
          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary"
        >
          {{ info?.ai?.provider || 'openai' }}
        </span>
      </div>
      <button
        class="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
        @click="showSettings = !showSettings"
      >
        <SIcon icon="lucide:settings" :size="14" />
      </button>
    </div>

    <div v-if="showSettings" class="px-3 py-2.5 border-b border-border/60 bg-card/30 space-y-2">
      <div>
        <label class="block text-[10px] font-medium text-muted-foreground mb-1">API Key</label>
        <input
          v-model="apiKey"
          type="password"
          placeholder="sk-..."
          class="w-full px-2 py-1.5 text-xs bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] font-medium text-muted-foreground mb-1">API Base URL (optional)</label>
        <input
          v-model="apiBase"
          type="text"
          placeholder="https://api.openai.com/v1"
          class="w-full px-2 py-1.5 text-xs bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <div>
        <label class="block text-[10px] font-medium text-muted-foreground mb-1">Model (optional)</label>
        <input
          v-model="model"
          type="text"
          placeholder="gpt-4o-mini"
          class="w-full px-2 py-1.5 text-xs bg-input border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
      <button
        class="w-full px-2 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        @click="saveSettings"
      >
        Save Settings
      </button>
    </div>

    <div v-if="!hasApiKey && !showSettings" class="px-3 py-2 bg-warning/10 border-b border-warning/20">
      <p class="text-[10px] text-warning flex items-start gap-1.5">
        <SIcon icon="lucide:alert-circle" :size="12" class="mt-0.5 flex-shrink-0" />
        <span>
          No API key configured. Set UBEAN_AI_API_KEY/OPENAI_API_KEY env var or configure in settings. Simple text
          commands still work without LLM.
        </span>
      </p>
    </div>

    <div ref="messagesEl" class="flex-1 overflow-y-auto px-3 py-3 space-y-3">
      <template v-for="(msg, idx) in messages" :key="idx">
        <div class="flex gap-2" :class="[msg.role === 'user' ? 'justify-end' : 'justify-start']">
          <div
            v-if="msg.role !== 'user'"
            class="size-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"
          >
            <SIcon icon="lucide:sparkles" :size="11" class="text-primary" />
          </div>
          <div class="max-w-[85%] space-y-1.5">
            <div
              class="px-3 py-2 rounded-lg text-xs leading-relaxed" :class="[
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-tr-sm'
                  : 'bg-card border border-border/60 text-foreground rounded-tl-sm'
              ]"
            >
              <div class="whitespace-pre-wrap">{{ msg.content }}</div>
            </div>
            <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="space-y-1">
              <div
                v-for="tc in msg.toolCalls"
                :key="tc.id"
                class="px-2 py-1 bg-muted/50 border border-border/40 rounded text-[10px] font-mono text-muted-foreground"
              >
                <SIcon icon="lucide:wrench" :size="10" class="inline mr-1" />
                {{ formatToolCall(tc.name, tc.arguments) }}
              </div>
            </div>
            <div v-if="msg.toolResults && msg.toolResults.length > 0" class="space-y-1">
              <div
                v-for="tr in msg.toolResults"
                :key="tr.toolCallId"
                class="px-2 py-1.5 bg-success/5 border border-success/20 rounded text-[10px] font-mono text-success/90 whitespace-pre-wrap"
              >
                {{ tr.error ? `❌ ${tr.error}` : formatToolResult(tr.result) }}
              </div>
            </div>
          </div>
          <div
            v-if="msg.role === 'user'"
            class="size-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5"
          >
            <SIcon icon="lucide:user" :size="11" class="text-primary-foreground" />
          </div>
        </div>
      </template>

      <div v-if="isLoading" class="flex gap-2 justify-start">
        <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <SIcon icon="lucide:sparkles" :size="11" class="text-primary" />
        </div>
        <div class="px-3 py-2 rounded-lg bg-card border border-border/60 rounded-tl-sm">
          <div class="flex gap-1">
            <span
              class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
              style="animation-delay: 0ms"
            ></span>
            <span
              class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
              style="animation-delay: 150ms"
            ></span>
            <span
              class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
              style="animation-delay: 300ms"
            ></span>
          </div>
        </div>
      </div>

      <div v-if="messages.length <= 1" class="pt-2">
        <p class="text-[10px] text-muted-foreground mb-2 font-medium">Try:</p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="s in suggestions"
            :key="s.text"
            class="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-card border border-border/60 rounded-md hover:bg-secondary hover:border-border text-muted-foreground hover:text-foreground transition-colors"
            @click="sendMessage(s.text)"
          >
            <SIcon :icon="s.icon" :size="10" />
            {{ s.text }}
          </button>
        </div>
      </div>
    </div>

    <div class="px-3 py-2.5 border-t border-border/60 bg-card/50">
      <div class="flex items-end gap-2">
        <textarea
          v-model="input"
          rows="1"
          placeholder="Ask me anything about your project..."
          class="flex-1 resize-none px-3 py-2 text-xs bg-input border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary max-h-24"
          @keydown="handleKeydown"
        ></textarea>
        <button
          :disabled="!input.trim() || isLoading"
          class="size-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
          @click="() => sendMessage()"
        >
          <SIcon icon="lucide:send-horizontal" :size="14" />
        </button>
      </div>
      <p class="text-[9px] text-muted-foreground/60 mt-1 text-center">Press Enter to send, Shift+Enter for new line</p>
    </div>
  </div>
</template>
