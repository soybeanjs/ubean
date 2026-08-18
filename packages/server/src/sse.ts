import type { Context, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '@ubean/shared';

export interface SSEMessage {
  data?: string | object;
  event?: string;
  id?: string;
  retry?: number;
  comment?: string;
}

export interface SSEConnection {
  readonly id: string;
  send(message: SSEMessage): void;
  sendData(data: string | object, event?: string): void;
  comment(text: string): void;
  close(): void;
  readonly closed: boolean;
}

export interface SSEHandler {
  onConnect?: (connection: SSEConnection) => void | Promise<void>;
  onClose?: (connection: SSEConnection) => void | Promise<void>;
}

export interface SSEOptions {
  headers?: Record<string, string>;
  retry?: number;
  keepAlive?: boolean | number;
}

const connections = new Map<string, SSEConnectionImpl>();
let idSeed = 0;

function generateId(): string {
  idSeed++;
  return `sse_${Date.now().toString(36)}_${idSeed.toString(36)}`;
}

export function formatSSEMessage(msg: SSEMessage): string {
  const lines: string[] = [];

  if (msg.comment) {
    for (const line of msg.comment.split('\n')) {
      lines.push(`: ${line}`);
    }
  }

  if (msg.id != null) {
    lines.push(`id: ${msg.id}`);
  }

  if (msg.event) {
    lines.push(`event: ${msg.event}`);
  }

  if (msg.retry != null) {
    lines.push(`retry: ${msg.retry}`);
  }

  if (msg.data != null) {
    const data = typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data);
    for (const line of data.split('\n')) {
      lines.push(`data: ${line}`);
    }
  }

  return `${lines.join('\n')}\n\n`;
}

class SSEConnectionImpl implements SSEConnection {
  readonly id: string;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private encoder = new TextEncoder();
  private _closed = false;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private onCloseCb?: (conn: SSEConnection) => void | Promise<void>;

  constructor(
    writer: WritableStreamDefaultWriter<Uint8Array>,
    options: SSEOptions = {},
    onClose?: (conn: SSEConnection) => void | Promise<void>
  ) {
    this.id = generateId();
    this.writer = writer;
    this.onCloseCb = onClose;

    if (options.keepAlive !== false) {
      const interval = typeof options.keepAlive === 'number' ? options.keepAlive : 30000;
      this.keepAliveTimer = setInterval(() => {
        if (!this._closed) {
          this.comment('keep-alive');
        }
      }, interval);
    }

    connections.set(this.id, this);
  }

  get closed(): boolean {
    return this._closed;
  }

  send(msg: SSEMessage): void {
    if (this._closed || !this.writer) return;
    const raw = formatSSEMessage(msg);
    this.writer.write(this.encoder.encode(raw)).catch(() => this._cleanup());
  }

  sendData(data: string | object, event?: string): void {
    this.send({ data, event });
  }

  comment(text: string): void {
    if (this._closed || !this.writer) return;
    try {
      const raw = `: ${text}\n\n`;
      this.writer.write(this.encoder.encode(raw)).catch(() => this._cleanup());
    } catch {
      this._cleanup();
    }
  }

  close(): void {
    this._cleanup();
  }

  private _cleanup(): void {
    if (this._closed) return;
    this._closed = true;
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.writer) {
      try {
        this.writer.close();
      } catch {}
      this.writer = null;
    }
    connections.delete(this.id);
    if (this.onCloseCb) {
      try {
        Promise.resolve(this.onCloseCb(this)).catch(() => {});
      } catch {}
      this.onCloseCb = undefined;
    }
  }
}

export function createSSEStream(c: Context<UbeanEnv>, handler: SSEHandler, options: SSEOptions = {}): Response {
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();

  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    ...options.headers
  };

  const connection = new SSEConnectionImpl(writer, options, handler.onClose);

  if (options.retry != null) {
    connection.send({ retry: options.retry });
  }

  queueMicrotask(() => {
    Promise.resolve(handler.onConnect?.(connection)).catch(() => {});
  });

  return new Response(readable, { headers });
}

export function defineSSE(handler: SSEHandler, options?: SSEOptions): MiddlewareHandler<UbeanEnv> {
  return (async (c: Context<UbeanEnv>) => {
    return createSSEStream(c, handler, options);
  }) as MiddlewareHandler<UbeanEnv>;
}

export function getSSEConnections(): Map<string, SSEConnection> {
  return connections;
}

export function broadcastSSE(event: string, data: string | object, filter?: (conn: SSEConnection) => boolean): void {
  for (const conn of connections.values()) {
    if (!conn.closed && (!filter || filter(conn))) {
      conn.sendData(data, event);
    }
  }
}

export function closeAllSSE(): void {
  for (const conn of Array.from(connections.values())) {
    conn.close();
  }
  connections.clear();
}

export function sseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  };
}

export function clearSSEState(): void {
  closeAllSSE();
  idSeed = 0;
}
