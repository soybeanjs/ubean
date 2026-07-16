<script setup lang="ts">
/**
 * Floating AI button + right-side drawer.
 *
 * Mounted globally in App.vue. The button sits at the bottom-right
 * (left of the refresh button). Clicking opens a slide-in drawer with
 * a streaming AI chat. The drawer is context-aware: it receives the
 * current panel name and a resource summary so the AI can answer
 * panel-specific questions without the user typing context manually.
 */
import { ref, nextTick, computed, watch } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import type { AiChatMessage, AiChatResponse, AiStreamChunk } from '../composables/useRpc';
import { DEEPSEEK_API_BASE, DEEPSEEK_MODEL } from '../composables/useRpc';

const props = defineProps<{
  /** Current panel name (e.g. "Pages", "API Routes"). */
  panelContext: string;
  /** Brief summary of the current panel's resources. */
  resourceSummary?: string;
  /** Streaming chat function from useRpc. */
  sendChatStream: (
    messages: AiChatMessage[],
    options: { apiKey?: string; apiBase?: string; model?: string },
    onChunk: (chunk: AiStreamChunk) => void
  ) => Promise<AiChatResponse>;
  /** Refresh DevTools info (called after tool execution). */
  onRefresh: () => Promise<void>;
  /** Whether an API key is configured server-side. */
  aiEnabled?: boolean;
}>();

// --- Drawer state ---
const drawerOpen = ref(false);
const messages = ref<AiChatMessage[]>([]);
const input = ref('');
const isLoading = ref(false);
const messagesEl = ref<HTMLElement | null>(null);

// --- Settings ---
const showSettings = ref(false);
const apiKey = ref(localStorage.getItem('ubean_ai_api_key') || '');
const apiBase = ref(localStorage.getItem('ubean_ai_api_base') || '');
const model = ref(localStorage.getItem('ubean_ai_model') || '');

const hasApiKey = computed(() => !!apiKey.value || !!props.aiEnabled);

// --- Suggestions (context-aware) ---
const suggestions = computed(() => {
  const ctx = props.panelContext.toLowerCase();
  if (ctx.includes('page')) {
    return [
      { text: `Create a page /dashboard`, icon: 'lucide:plus' },
      { text: 'List all pages', icon: 'lucide:list' },
      { text: 'How do I add a layout to a page?', icon: 'lucide:help-circle' }
    ];
  }
  if (ctx.includes('api')) {
    return [
      { text: 'Create a GET /api/users route', icon: 'lucide:plus' },
      { text: 'List all API routes', icon: 'lucide:list' },
      { text: 'How do I validate request body?', icon: 'lucide:help-circle' }
    ];
  }
  if (ctx.includes('layout')) {
    return [
      { text: 'Create a layout admin', icon: 'lucide:plus' },
      { text: 'How do layouts work?', icon: 'lucide:help-circle' }
    ];
  }
  if (ctx.includes('middleware')) {
    return [
      { text: 'Create an auth middleware', icon: 'lucide:plus' },
      { text: 'How do global middlewares work?', icon: 'lucide:help-circle' }
    ];
  }
  if (ctx.includes('cron')) {
    return [
      { text: 'Create a daily cleanup cron', icon: 'lucide:plus' },
      { text: 'How do I schedule tasks?', icon: 'lucide:help-circle' }
    ];
  }
  return [
    { text: 'List all resources', icon: 'lucide:list' },
    { text: 'Show project info', icon: 'lucide:info' },
    { text: 'Create a page /about', icon: 'lucide:plus' }
  ];
});

// --- Panel context system message ---
// Injected at the start of the conversation so the AI knows which panel
// the user is currently viewing. Updated when the panel changes.
function buildContextMessage(): string {
  let ctx = `Current DevTools panel: ${props.panelContext}.`;
  if (props.resourceSummary) {
    ctx += `\n${props.resourceSummary}`;
  }
  ctx += `\nWhen the user asks to "create" or "add" something, use the create_resource tool. When they ask to "list" or "show" things, use list_resources. Be concise.`;
  return ctx;
}

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

  // Placeholder assistant message — updated in-place as chunks arrive.
  const assistantMsg: AiChatMessage = {
    role: 'assistant',
    content: '',
    timestamp: Date.now()
  };
  messages.value.push(assistantMsg);
  scrollToBottom();

  try {
    const opts: { apiKey?: string; apiBase?: string; model?: string } = {};
    if (apiKey.value) opts.apiKey = apiKey.value;
    if (apiBase.value) opts.apiBase = apiBase.value;
    if (model.value) opts.model = model.value;

    // Build the message list with the panel context as a system message.
    const contextMsg: AiChatMessage = {
      role: 'system',
      content: buildContextMessage(),
      timestamp: Date.now()
    };
    const fullMessages = [contextMsg, ...messages.value.slice(0, -1)]; // exclude placeholder

    const response = await props.sendChatStream(fullMessages, opts, (chunk: AiStreamChunk) => {
      // Update the placeholder message in-place.
      assistantMsg.content = chunk.text;
      if (chunk.toolCalls) {
        assistantMsg.toolCalls = chunk.toolCalls;
      }
      if (chunk.toolResults) {
        assistantMsg.toolResults = chunk.toolResults;
      }
      scrollToBottom();
    });

    // Finalize with the response.
    assistantMsg.content = response.message.content;
    assistantMsg.toolCalls = response.message.toolCalls;
    if (response.toolResults) {
      assistantMsg.toolResults = response.toolResults;
      // Refresh DevTools info if tools were executed.
      await props.onRefresh();
    }
  } catch (e) {
    assistantMsg.content = `Error: ${e instanceof Error ? e.message : 'Unknown error'}`;
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

// Reset conversation when the drawer is first opened.
watch(drawerOpen, (open) => {
  if (open && messages.value.length === 0) {
    messages.value = [
      {
        role: 'assistant',
        content: `👋 Hi! I'm your ubean AI assistant.\n\nYou're on the **${props.panelContext}** panel. ${props.resourceSummary ? props.resourceSummary + '\n\n' : ''}Ask me to create, list, or delete resources, or any ubean-related question.`,
        timestamp: Date.now()
      }
    ];
  }
});

// Update the welcome message when panel context changes (if conversation is empty).
watch(() => props.panelContext, (ctx) => {
  if (messages.value.length <= 1 && ctx) {
    messages.value = [
      {
        role: 'assistant',
        content: `👋 Hi! I'm your ubean AI assistant.\n\nYou're on the **${ctx}** panel. ${props.resourceSummary ? props.resourceSummary + '\n\n' : ''}Ask me to create, list, or delete resources, or any ubean-related question.`,
        timestamp: Date.now()
      }
    ];
  }
});
</script>

<template>
  <!-- Floating button (positioned left of the refresh button) -->
  <button
    class="fixed bottom-3 right-14 z-40 size-8 flex items-center justify-center rounded-full bg-primary text-primary-foreground border border-primary shadow-md hover:bg-primary/90 transition-all cursor-pointer group"
    title="AI Assistant"
    @click="drawerOpen = true"
  >
    <SIcon icon="lucide:sparkles" :size="14" class="transition-transform group-hover:scale-110" />
    <!-- Pulse ring -->
    <span
      v-if="!drawerOpen"
      class="absolute inset-0 rounded-full bg-primary/40 animate-ping opacity-30"
      style="animation-duration: 2s"
    ></span>
  </button>

  <!-- Drawer + backdrop -->
  <Teleport to="body">
    <Transition name="ai-drawer">
      <div v-if="drawerOpen" class="fixed inset-0 z-50 flex justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30 backdrop-blur-sm" @click="drawerOpen = false"></div>

        <!-- Drawer panel -->
        <div class="relative w-full max-w-sm h-full bg-background border-l border-base shadow-2xl flex flex-col">
          <!-- Header -->
          <div class="flex items-center justify-between px-3 py-2.5 border-b border-base bg-background/50">
            <div class="flex items-center gap-2">
              <div class="size-6 rounded-full bg-primary/10 flex items-center justify-center">
                <SIcon icon="lucide:sparkles" :size="12" class="text-primary" />
              </div>
              <div class="flex flex-col">
                <span class="text-xs font-semibold text-foreground">AI Assistant</span>
                <span class="text-[9px] text-muted-foreground">{{ panelContext }}{{ resourceSummary ? ` · ${resourceSummary}` : '' }}</span>
              </div>
            </div>
            <div class="flex items-center gap-1">
              <button
                class="size-6 flex items-center justify-center rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Settings"
                @click="showSettings = !showSettings"
              >
                <SIcon icon="lucide:settings" :size="13" />
              </button>
              <button
                class="size-6 flex items-center justify-center rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Close"
                @click="drawerOpen = false"
              >
                <SIcon icon="lucide:x" :size="14" />
              </button>
            </div>
          </div>

          <!-- Settings panel (collapsible) -->
          <div v-if="showSettings" class="px-3 py-2.5 border-b border-base bg-background/30 space-y-2">
            <div>
              <label class="block text-[10px] font-medium text-muted-foreground mb-1">API Key</label>
              <input
                v-model="apiKey"
                type="password"
                placeholder="sk-... (DeepSeek or OpenAI-compatible)"
                class="w-full px-2 py-1.5 text-xs bg-background border border-base rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label class="block text-[10px] font-medium text-muted-foreground mb-1">API Base URL</label>
              <input
                v-model="apiBase"
                type="text"
                :placeholder="DEEPSEEK_API_BASE"
                class="w-full px-2 py-1.5 text-xs bg-background border border-base rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <div>
              <label class="block text-[10px] font-medium text-muted-foreground mb-1">Model</label>
              <input
                v-model="model"
                type="text"
                :placeholder="DEEPSEEK_MODEL"
                class="w-full px-2 py-1.5 text-xs bg-background border border-base rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
            <button
              class="w-full px-2 py-1.5 text-xs font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              @click="saveSettings"
            >
              Save Settings
            </button>
          </div>

          <!-- No API key warning -->
          <div v-if="!hasApiKey && !showSettings" class="px-3 py-2 bg-warning/10 border-b border-warning/20">
            <p class="text-[10px] text-warning flex items-start gap-1.5">
              <SIcon icon="lucide:alert-circle" :size="12" class="mt-0.5 flex-shrink-0" />
              <span>
                No API key configured. Simple commands work without LLM. For natural language chat, set
                <code class="text-warning font-mono">DEEPSEEK_API_KEY</code> env var or configure in settings.
              </span>
            </p>
          </div>

          <!-- Messages -->
          <div ref="messagesEl" class="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            <template v-for="(msg, idx) in messages" :key="idx">
              <div class="flex gap-2" :class="[msg.role === 'user' ? 'justify-end' : 'justify-start']">
                <!-- AI avatar -->
                <div
                  v-if="msg.role !== 'user'"
                  class="size-5 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5"
                >
                  <SIcon icon="lucide:sparkles" :size="10" class="text-primary" />
                </div>

                <div class="max-w-[85%] space-y-1.5">
                  <!-- Message bubble -->
                  <div
                    class="px-2.5 py-1.5 rounded-lg text-xs leading-relaxed"
                    :class="[
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                        : 'bg-background border border-base text-foreground rounded-tl-sm'
                    ]"
                  >
                    <div v-if="msg.content" class="whitespace-pre-wrap">{{ msg.content }}</div>
                    <!-- Typing indicator for empty streaming message -->
                    <div v-else-if="isLoading && idx === messages.length - 1" class="flex gap-1 py-0.5">
                      <span class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 0ms"></span>
                      <span class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 150ms"></span>
                      <span class="size-1.5 rounded-full bg-muted-foreground/40 animate-bounce" style="animation-delay: 300ms"></span>
                    </div>
                  </div>

                  <!-- Tool calls -->
                  <div v-if="msg.toolCalls && msg.toolCalls.length > 0" class="space-y-1">
                    <div
                      v-for="tc in msg.toolCalls"
                      :key="tc.id"
                      class="px-2 py-1 bg-secondary border border-base rounded text-[10px] font-mono text-muted-foreground"
                    >
                      <SIcon icon="lucide:wrench" :size="10" class="inline mr-1" />
                      {{ formatToolCall(tc.name, tc.arguments) }}
                    </div>
                  </div>

                  <!-- Tool results -->
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

                <!-- User avatar -->
                <div
                  v-if="msg.role === 'user'"
                  class="size-5 rounded-full bg-primary flex items-center justify-center flex-shrink-0 mt-0.5"
                >
                  <SIcon icon="lucide:user" :size="10" class="text-primary-foreground" />
                </div>
              </div>
            </template>

            <!-- Suggestions (only when conversation is just the welcome message) -->
            <div v-if="messages.length <= 1" class="pt-2">
              <p class="text-[10px] text-muted-foreground mb-2 font-medium">Try:</p>
              <div class="flex flex-wrap gap-1.5">
                <button
                  v-for="s in suggestions"
                  :key="s.text"
                  class="inline-flex items-center gap-1 px-2 py-1 text-[10px] bg-background border border-base rounded-md hover:bg-active text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  @click="sendMessage(s.text)"
                >
                  <SIcon :icon="s.icon" :size="10" />
                  {{ s.text }}
                </button>
              </div>
            </div>
          </div>

          <!-- Input area -->
          <div class="px-3 py-2.5 border-t border-base bg-background/50">
            <div class="flex items-end gap-2">
              <textarea
                v-model="input"
                rows="1"
                :placeholder="`Ask about ${panelContext}...`"
                class="flex-1 resize-none px-2.5 py-1.5 text-xs bg-background border border-base rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary-500 max-h-24"
                @keydown="handleKeydown"
              ></textarea>
              <button
                :disabled="!input.trim() || isLoading"
                class="size-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors"
                @click="() => sendMessage()"
              >
                <SIcon icon="lucide:send-horizontal" :size="12" />
              </button>
            </div>
            <p class="text-[9px] text-muted-foreground/60 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-drawer-enter-active,
.ai-drawer-leave-active {
  transition: opacity 0.2s ease;
}
.ai-drawer-enter-active > div:last-child,
.ai-drawer-leave-active > div:last-child {
  transition: transform 0.25s ease;
}
.ai-drawer-enter-from,
.ai-drawer-leave-to {
  opacity: 0;
}
.ai-drawer-enter-from > div:last-child,
.ai-drawer-leave-to > div:last-child {
  transform: translateX(100%);
}
</style>
