<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { SIcon } from '@soybeanjs/ui';
import { Terminal as XTermTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import type { TerminalStartParams, TerminalPollResult } from '../composables/useRpc';

const props = defineProps<{
  cwd?: string;
  terminalStart: (params: TerminalStartParams) => Promise<{ sessionId: string } | null>;
  terminalInput: (sessionId: string, data: string) => Promise<boolean>;
  terminalResize: (sessionId: string, cols: number, rows: number) => Promise<boolean>;
  terminalPoll: (sessionId: string) => Promise<TerminalPollResult>;
  terminalKill: (sessionId: string) => Promise<boolean>;
}>();

const containerRef = ref<HTMLDivElement | null>(null);
const statusText = ref('Starting...');
const isExited = ref(false);
const showOverlay = ref(true);
const overlayMsg = ref('Initializing terminal...');

let term: XTermTerminal | null = null;
let fitAddon: FitAddon | null = null;
let sessionId: string | null = null;
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let destroyed = false;

const DARK_THEME = {
  background: '#0a0a0a',
  foreground: '#e4e4e7',
  cursor: '#e4e4e7',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#264f78',
  black: '#000000',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#ca8a04',
  blue: '#2563eb',
  magenta: '#9333ea',
  cyan: '#0891b2',
  white: '#e4e4e7',
  brightBlack: '#71717a',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#facc15',
  brightBlue: '#60a5fa',
  brightMagenta: '#c084fc',
  brightCyan: '#22d3ee',
  brightWhite: '#ffffff'
};

async function startSession() {
  if (!containerRef.value || destroyed) return;

  // Create xterm instance with a dark theme — terminals are conventionally
  // dark regardless of the surrounding app theme (VS Code, iTerm, etc.).
  term = new XTermTerminal({
    cursorBlink: true,
    fontSize: 12,
    lineHeight: 1.2,
    fontFamily: "'DM Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    theme: DARK_THEME,
    allowProposedApi: true,
    scrollback: 5000,
    convertEol: false
  });
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(containerRef.value);

  // Initial fit — may fail if the container has no layout yet.
  try {
    fitAddon.fit();
  } catch {
    // ignore
  }

  const cols = term.cols;
  const rows = term.rows;

  // Start the server-side shell session.
  const result = await props.terminalStart({
    cwd: props.cwd || '.',
    cols,
    rows
  });

  if (!result || destroyed) {
    if (!destroyed) {
      showOverlay.value = true;
      overlayMsg.value = 'Failed to start terminal session';
      statusText.value = 'Error';
    }
    return;
  }

  sessionId = result.sessionId;
  showOverlay.value = false;
  isExited.value = false;
  statusText.value = `${cols}×${rows} · ${props.cwd ? shortCwd(props.cwd) : 'cwd'}`;

  // Input relay: xterm → server.
  term.onData(data => {
    if (sessionId && !isExited.value) {
      void props.terminalInput(sessionId, data);
    }
  });

  // Resize relay: xterm → server (server-side resize is a no-op with
  // `script`, but we send it for future node-pty compatibility).
  term.onResize(({ cols: c, rows: r }) => {
    if (sessionId) {
      void props.terminalResize(sessionId, c, r);
      statusText.value = `${c}×${r} · ${props.cwd ? shortCwd(props.cwd) : 'cwd'}`;
    }
  });

  // Focus for immediate keyboard input.
  term.focus();

  // Start the polling loop — recursive setTimeout avoids overlapping
  // RPC calls when the server is slow to respond.
  startPolling();
}

function startPolling() {
  async function poll() {
    if (!sessionId || destroyed) return;

    let result: TerminalPollResult;
    try {
      result = await props.terminalPoll(sessionId);
    } catch {
      // Network blip — keep trying.
      if (!destroyed) pollTimer = setTimeout(poll, 100);
      return;
    }

    if (destroyed) return;

    if (result.data && term) {
      term.write(result.data);
    }

    if (result.exited) {
      isExited.value = true;
      statusText.value = `Exited (code ${result.exitCode})`;
      return; // Stop polling.
    }

    // Short interval for responsive output (~30 fps).
    pollTimer = setTimeout(poll, 33);
  }

  poll();
}

function clearTerminal() {
  if (term) {
    term.clear();
  }
}

async function restart() {
  // Tear down existing session.
  if (sessionId) {
    await props.terminalKill(sessionId);
    sessionId = null;
  }
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (term) {
    term.dispose();
    term = null;
  }
  fitAddon = null;
  isExited.value = false;
  showOverlay.value = true;
  overlayMsg.value = 'Restarting...';
  statusText.value = 'Restarting...';
  await nextTick();
  await startSession();
}

function setupResizeObserver() {
  if (!containerRef.value) return;
  resizeObserver = new ResizeObserver(() => {
    try {
      fitAddon?.fit();
    } catch {
      // ignore — container may not be ready
    }
  });
  resizeObserver.observe(containerRef.value);
}

function shortCwd(cwd: string): string {
  const parts = cwd.split('/');
  if (parts.length <= 2) return cwd;
  return `.../${parts.slice(-2).join('/')}`;
}

onMounted(async () => {
  await startSession();
  if (!destroyed) setupResizeObserver();
});

onUnmounted(() => {
  destroyed = true;
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (sessionId) {
    void props.terminalKill(sessionId);
    sessionId = null;
  }
  if (term) {
    term.dispose();
    term = null;
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Toolbar -->
    <div class="px-3.5 py-2 border-b border-base bg-background flex items-center gap-2 flex-shrink-0">
      <SIcon icon="lucide:square-terminal" :size="14" class="text-primary flex-shrink-0" />
      <span class="text-xs font-medium text-foreground flex-shrink-0">Terminal</span>
      <span
        v-if="cwd"
        class="text-2xs text-muted-foreground font-mono truncate max-w-[280px] op-fade"
        :title="cwd"
      >
        {{ cwd }}
      </span>
      <span class="ml-auto text-2xs text-muted-foreground flex-shrink-0 op-fade">
        <span
          class="inline-block size-1.5 rounded-full mr-1.5"
          :class="isExited ? 'bg-destructive' : 'bg-success'"
        />
        {{ statusText }}
      </span>
      <button
        class="size-6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-active rounded transition-all cursor-pointer flex-shrink-0"
        title="Clear scrollback"
        @click="clearTerminal"
      >
        <SIcon icon="lucide:eraser" :size="12" />
      </button>
      <button
        class="size-6 flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 rounded transition-all cursor-pointer flex-shrink-0"
        title="Restart session"
        @click="restart"
      >
        <SIcon icon="lucide:rotate-cw" :size="12" />
      </button>
    </div>

    <!-- Terminal surface -->
    <div class="flex-1 relative overflow-hidden bg-[#0a0a0a]">
      <div ref="containerRef" class="absolute inset-0 px-2 py-1.5" />
      <div
        v-if="showOverlay"
        class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground text-xs bg-[#0a0a0a]"
      >
        <div class="size-7 border-2 border-muted border-t-primary rounded-full animate-spin"></div>
        <span class="op-fade">{{ overlayMsg }}</span>
      </div>
    </div>
  </div>
</template>
