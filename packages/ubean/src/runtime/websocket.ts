import type { Context, MiddlewareHandler } from 'hono';
import type { UbeanEnv } from '../types/handler';

export interface Peer {
  readonly id: string;
  readonly url: string;
  readonly headers: Headers;
  readonly readyState: number;
  send(data: string | ArrayBuffer | Uint8Array): void;
  publish(topic: string, data: string | ArrayBuffer | Uint8Array): void;
  subscribe(topic: string): void;
  unsubscribe(topic: string): void;
  close(code?: number, reason?: string): void;
  getData<T = unknown>(): T | undefined;
  setData<T>(data: T): void;
}

export interface WebSocketRoom {
  readonly name: string;
  readonly peers: Set<Peer>;
  broadcast(data: string | ArrayBuffer | Uint8Array, options?: { except?: Peer }): void;
  add(peer: Peer): void;
  remove(peer: Peer): void;
}

export interface WebSocketHooks {
  open?: (peer: Peer) => void | Promise<void>;
  message?: (peer: Peer, message: string | ArrayBuffer) => void | Promise<void>;
  close?: (peer: Peer, code: number, reason: string) => void | Promise<void>;
  error?: (peer: Peer, error: Error) => void | Promise<void>;
}

export interface WebSocketDefinition {
  path?: string;
  hooks?: WebSocketHooks;
  topics?: string[];
  rooms?: string[];
}

interface InternalPeer extends Peer {
  _data?: unknown;
  _subscriptions: Set<string>;
  _rooms: Set<string>;
  _raw?: unknown;
}

const rooms = new Map<string, WebSocketRoom>();
const topicSubscribers = new Map<string, Set<Peer>>();
const definitions = new Map<string, WebSocketDefinition>();
const peerIdSeed = { value: 0 };

class RoomImpl implements WebSocketRoom {
  readonly name: string;
  readonly peers: Set<Peer> = new Set();

  constructor(name: string) {
    this.name = name;
  }

  broadcast(msg: string | ArrayBuffer | Uint8Array, options?: { except?: Peer }): void {
    for (const peer of this.peers) {
      if (options?.except && peer === options.except) continue;
      if (peer.readyState === 1) {
        try {
          peer.send(msg);
        } catch {}
      }
    }
  }

  add(peer: Peer): void {
    this.peers.add(peer);
    (peer as InternalPeer)._rooms.add(this.name);
  }

  remove(peer: Peer): void {
    this.peers.delete(peer);
    (peer as InternalPeer)._rooms.delete(this.name);
    if (this.peers.size === 0) {
      rooms.delete(this.name);
    }
  }
}

function generateId(): string {
  peerIdSeed.value++;
  return `peer_${Date.now().toString(36)}_${peerIdSeed.value.toString(36)}`;
}

function createPeer(options: {
  id: string;
  url: string;
  headers: Headers;
  send: (data: string | ArrayBuffer | Uint8Array) => void;
  close: (code?: number, reason?: string) => void;
  raw?: unknown;
}): InternalPeer {
  const subscriptions = new Set<string>();
  const peerRooms = new Set<string>();
  let data: unknown = undefined;

  const peer: InternalPeer = {
    id: options.id,
    url: options.url,
    headers: options.headers,
    get readyState() {
      return 1;
    },
    _subscriptions: subscriptions,
    _rooms: peerRooms,
    _raw: options.raw,

    send: options.send,
    close: options.close,

    publish(topic: string, msg) {
      const topicPeers = topicSubscribers.get(topic);
      if (topicPeers) {
        for (const p of topicPeers) {
          if (p !== peer && p.readyState === 1) {
            try {
              p.send(msg);
            } catch {}
          }
        }
      }
    },

    subscribe(topic: string) {
      subscriptions.add(topic);
      let set = topicSubscribers.get(topic);
      if (!set) {
        set = new Set();
        topicSubscribers.set(topic, set);
      }
      set.add(peer);
    },

    unsubscribe(topic: string) {
      subscriptions.delete(topic);
      topicSubscribers.get(topic)?.delete(peer);
    },

    getData<T>() {
      return data as T | undefined;
    },

    setData<T>(value: T) {
      data = value;
    }
  };

  return peer;
}

export function createRoom(name: string): WebSocketRoom {
  const existing = rooms.get(name);
  if (existing) return existing;
  const room = new RoomImpl(name);
  rooms.set(name, room);
  return room;
}

export function defineWebSocket(def: WebSocketDefinition): WebSocketDefinition {
  return def;
}

export function defineRoom(name: string): WebSocketRoom {
  return createRoom(name);
}

export function getRoom(name: string): WebSocketRoom | undefined {
  return rooms.get(name);
}

export function getRooms(): Map<string, WebSocketRoom> {
  return rooms;
}

export function broadcast(topic: string, data: string | ArrayBuffer | Uint8Array): void {
  const peers = topicSubscribers.get(topic);
  if (!peers) return;
  for (const peer of peers) {
    if (peer.readyState === 1) {
      try {
        peer.send(data);
      } catch {}
    }
  }
}

export function registerWebSocket(path: string, def: WebSocketDefinition): void {
  definitions.set(path, def);
}

export function getWebSocketDefinitions(): Map<string, WebSocketDefinition> {
  return definitions;
}

export interface UpgradeResult {
  response: Response;
  peer: Peer;
}

export function handleUpgrade(
  c: Context<UbeanEnv>,
  options: {
    send: (data: string | ArrayBuffer | Uint8Array) => void;
    close: (code?: number, reason?: string) => void;
    raw?: unknown;
  }
): UpgradeResult {
  const path = new URL(c.req.url).pathname;
  const def = definitions.get(path) || definitions.get('/*');
  const id = generateId();

  const peer = createPeer({
    id,
    url: c.req.url,
    headers: c.req.raw.headers,
    send: options.send,
    close: options.close,
    raw: options.raw
  });

  if (def?.topics) {
    for (const topic of def.topics) {
      peer.subscribe(topic);
    }
  }

  if (def?.rooms) {
    for (const roomName of def.rooms) {
      const room = createRoom(roomName);
      room.add(peer);
    }
  }

  if (def?.hooks?.open) {
    queueMicrotask(() => {
      Promise.resolve(def.hooks!.open!(peer)).catch(() => {});
    });
  }

  return {
    response: new Response(null, { status: 200, headers: { 'Upgrade': 'websocket', 'Connection': 'Upgrade' } }),
    peer
  };
}

export function handleMessage(peer: Peer, message: string | ArrayBuffer): void {
  const path = new URL(peer.url).pathname;
  const def = definitions.get(path) || definitions.get('/*');
  if (def?.hooks?.message) {
    Promise.resolve(def.hooks.message(peer, message)).catch(() => {});
  }
}

export function handleClose(peer: Peer, code: number = 1000, reason: string = ''): void {
  const path = new URL(peer.url).pathname;
  const def = definitions.get(path) || definitions.get('/*');

  const internal = peer as InternalPeer;
  for (const topic of internal._subscriptions) {
    topicSubscribers.get(topic)?.delete(peer);
  }
  for (const roomName of internal._rooms) {
    rooms.get(roomName)?.remove(peer);
  }
  internal._subscriptions.clear();

  if (def?.hooks?.close) {
    Promise.resolve(def.hooks.close(peer, code, reason)).catch(() => {});
  }
}

export function handleError(peer: Peer, error: Error): void {
  const path = new URL(peer.url).pathname;
  const def = definitions.get(path) || definitions.get('/*');
  if (def?.hooks?.error) {
    Promise.resolve(def.hooks.error(peer, error)).catch(() => {});
  }
}

export function createWebSocketMiddleware(): MiddlewareHandler<UbeanEnv> {
  return async function wsMiddleware(c, next) {
    const upgradeHeader = c.req.header('upgrade');
    if (upgradeHeader?.toLowerCase() !== 'websocket') {
      await next();
      return;
    }

    const path = new URL(c.req.url).pathname;
    const def = definitions.get(path);
    if (!def) {
      await next();
      return;
    }

    return new Response('WebSocket upgrade requires platform-specific handler', { status: 426 });
  };
}

export function clearWebSocketState(): void {
  rooms.clear();
  topicSubscribers.clear();
  definitions.clear();
  peerIdSeed.value = 0;
}
