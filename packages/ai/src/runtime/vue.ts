/**
 * `@ubean/ai/runtime/vue` — Vue runtime composables.
 *
 * Self-built, SSR-safe thin layer over the `@ubean/ai` kernel. It does NOT
 * depend on `@ai-sdk/vue`; it talks directly to the SSE protocol emitted by
 * `UbeanAgent.asHandler()` (chunks of `AgentStreamChunk`).
 *
 * Rendering is intentionally out of scope (decision C): this module only
 * produces message state; users pick their own markdown/code renderer.
 */
import { computed, ref, shallowRef } from 'vue';
import type { ComputedRef, Ref } from 'vue';
import type {
  AgentInput,
  AgentRunResult,
  AgentStreamChunk,
  AgentToolCall,
  AgentToolResult,
  UbeanAgent
} from '../types';

// ---------------------------------------------------------------------------
// Public message types
// ---------------------------------------------------------------------------

/** A single chat message managed by `useChat`. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Tool calls emitted during this assistant turn. */
  toolCalls?: AgentToolCall[];
  /** Tool results collected during this assistant turn. */
  toolResults?: AgentToolResult[];
  createdAt?: number;
}

export type ChatStatus = 'ready' | 'streaming' | 'error';

export interface UseChatOptions {
  /** SSE endpoint. Defaults to a relative `./chat` route if not provided. */
  url?: string;
  /** Initial conversation history. */
  initialMessages?: ChatMessage[];
  /** Extra fields merged into the request body (e.g. `meta`). */
  body?: Record<string, unknown>;
  /** Custom fetch implementation (for wire mocking / tests). */
  fetch?: typeof fetch;
}

/** A parsed SSE event payload. */
interface SseEvent {
  data?: string;
}

// ---------------------------------------------------------------------------
// SSE helpers (SSR-safe: no top-level DOM access)
// ---------------------------------------------------------------------------

/** Parse a raw SSE byte stream into a JSON `AgentStreamChunk` generator. */
async function* parseSseStream(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: AgentStreamChunk) => void
): AsyncGenerator<AgentStreamChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      const event = parseSseEvent(rawEvent);
      if (!event.data) continue;
      let chunk: AgentStreamChunk;
      try {
        chunk = JSON.parse(event.data) as AgentStreamChunk;
      } catch {
        continue; // ignore malformed frames
      }
      onChunk(chunk);
      yield chunk;
    }
  }
}

function parseSseEvent(raw: string): SseEvent {
  let data = '';
  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith('data:')) {
      data += line.slice(5).trimStart();
    }
  }
  return { data };
}

function nextId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// Auth / config context (module-level, set by `useUbeanAI` config plugin)
// ---------------------------------------------------------------------------

let providerConfig: { defaultProvider?: string; defaultModel?: string } = {};

/** Set the provider config used by `useAIProvider` (called by the Vite plugin). */
export function setAIProviderConfig(config: { defaultProvider?: string; defaultModel?: string }): void {
  providerConfig = config;
}

// ---------------------------------------------------------------------------
// useChat
// ---------------------------------------------------------------------------

export interface UseChatReturn {
  /** Reactive message list. */
  messages: Ref<ChatMessage[]>;
  /** 'ready' | 'streaming' | 'error'. */
  status: Ref<ChatStatus>;
  /** Last error, if any. */
  error: Ref<Error | null>;
  /** Text input bound to the chat box. */
  input: Ref<string>;
  /** Raw stream chunks of the latest turn. */
  data: Ref<AgentStreamChunk[]>;
  /** Set the input text programmatically. */
  setInput: (value: string) => void;
  /** Send a message (uses `input` if `content` omitted). */
  sendMessage: (content?: string) => Promise<void>;
  /** Abort the in-flight stream. */
  abort: () => void;
  /** Re-send the last user message. */
  reload: () => Promise<void>;
  /** Whether the chat is currently streaming. */
  isStreaming: ComputedRef<boolean>;
}

/**
 * SSR-safe chat composable. Maintains reactive message state and streams
 * `AgentStreamChunk` SSE frames from the `asHandler()` endpoint.
 */
export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const messages = ref<ChatMessage[]>(options.initialMessages ?? []);
  const status = ref<ChatStatus>('ready');
  const error = ref<Error | null>(null);
  const input = ref<string>('');
  const data = ref<AgentStreamChunk[]>([]);

  let controller: AbortController | null = null;
  let lastUserPrompt: string | null = null;

  const isStreaming = computed(() => status.value === 'streaming');

  const url = options.url ?? './chat';
  const fetchImpl = options.fetch ?? globalThis.fetch?.bind(globalThis);

  function setInput(value: string): void {
    input.value = value;
  }

  function abort(): void {
    controller?.abort();
  }

  async function sendMessage(content?: string): Promise<void> {
    const text = content ?? input.value;
    if (!text || status.value === 'streaming') return;

    const userMsg: ChatMessage = { id: nextId(), role: 'user', content: text, createdAt: Date.now() };
    messages.value = [...messages.value, userMsg];
    input.value = '';
    data.value = [];
    lastUserPrompt = text;

    const body: Record<string, unknown> = {
      ...options.body,
      messages: messages.value.map(({ role, content: c }) => ({ role, content: c }))
    };

    if (!fetchImpl) {
      status.value = 'error';
      error.value = new Error('fetch is not available (SSR?) — useChat should only run on the client');
      return;
    }

    controller = new AbortController();
    status.value = 'streaming';
    error.value = null;

    let assistantId = nextId();
    const assistantMsg: ChatMessage = { id: assistantId, role: 'assistant', content: '', createdAt: Date.now() };
    messages.value = [...messages.value, assistantMsg];

    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok || !res.body) {
        throw new Error(`Chat request failed with status ${res.status}`);
      }

      const applyChunk = (chunk: AgentStreamChunk): void => {
        data.value.push(chunk);
        const idx = messages.value.findIndex(m => m.id === assistantId);
        if (idx === -1) return;
        const current = messages.value[idx];
        if (chunk.type === 'text-delta') {
          current.content += chunk.text;
        } else if (chunk.type === 'tool-call') {
          current.toolCalls = [
            ...(current.toolCalls ?? []),
            { toolCallId: chunk.toolCallId, toolName: chunk.toolName, input: chunk.input }
          ];
        } else if (chunk.type === 'tool-result') {
          current.toolResults = [
            ...(current.toolResults ?? []),
            { toolName: chunk.toolName, toolCallId: chunk.toolCallId, result: chunk.result, error: chunk.error }
          ];
        }
        // Shallow assignment to trigger the reactive ref.
        messages.value = [...messages.value];
      };

      for await (const _chunk of parseSseStream(res.body, applyChunk)) {
        // side effects handled in applyChunk
      }

      status.value = 'ready';
    } catch (err) {
      if (controller.signal.aborted) {
        status.value = 'ready';
        return;
      }
      status.value = 'error';
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      controller = null;
    }
  }

  async function reload(): Promise<void> {
    if (!lastUserPrompt || status.value === 'streaming') return;
    // Drop the trailing empty assistant placeholder, then re-send the last prompt.
    const last = messages.value[messages.value.length - 1];
    if (last && last.role === 'assistant' && !last.content && !last.toolCalls?.length && !last.toolResults?.length) {
      messages.value = messages.value.slice(0, -1);
    }
    await sendMessage(lastUserPrompt);
  }

  return {
    messages,
    status,
    error,
    input,
    data,
    setInput,
    sendMessage,
    abort,
    reload,
    isStreaming
  };
}

// ---------------------------------------------------------------------------
// useAgent
// ---------------------------------------------------------------------------

export interface UseAgentReturn<T = unknown> {
  isStreaming: Ref<boolean>;
  error: Ref<Error | null>;
  result: Ref<AgentRunResult<T> | null>;
  chunks: Ref<AgentStreamChunk[]>;
  run: (input: AgentInput) => Promise<void>;
  stream: (input: AgentInput) => Promise<void>;
}

/** Drive a `UbeanAgent` directly from a component with reactive state. */
export function useAgent<T = unknown>(agent: UbeanAgent<T>): UseAgentReturn<T> {
  const isStreaming = ref(false);
  const error = ref<Error | null>(null);
  const result = shallowRef<AgentRunResult<T> | null>(null);
  const chunks = ref<AgentStreamChunk[]>([]);

  async function run(input: AgentInput): Promise<void> {
    isStreaming.value = true;
    error.value = null;
    chunks.value = [];
    try {
      result.value = await agent.run(input);
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isStreaming.value = false;
    }
  }

  async function stream(input: AgentInput): Promise<void> {
    isStreaming.value = true;
    error.value = null;
    result.value = null;
    chunks.value = [];
    try {
      for await (const chunk of agent.stream(input)) {
        chunks.value.push(chunk);
      }
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      isStreaming.value = false;
    }
  }

  return {
    isStreaming,
    error,
    result,
    chunks,
    run,
    stream
  };
}

// ---------------------------------------------------------------------------
// useAIProvider
// ---------------------------------------------------------------------------

/** Read the current fallback provider/model config (set by the Vite plugin). */
export function useAIProvider(): { defaultProvider?: string; defaultModel?: string } {
  return providerConfig;
}

// Re-export type-only surface for convenience.
export type {
  AgentInput,
  AgentRunResult,
  AgentStreamChunk,
  AgentToolCall,
  AgentToolResult,
  UbeanAgent
} from '../types';
