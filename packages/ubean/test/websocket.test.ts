import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  defineWebSocket,
  defineRoom,
  createRoom,
  getRoom,
  broadcast,
  registerWebSocket,
  getWebSocketDefinitions,
  clearWebSocketState
} from '../src/runtime/websocket';

describe('WebSocket definitions', () => {
  beforeEach(() => {
    clearWebSocketState();
  });

  it('defines WebSocket with hooks', () => {
    const hooks = { open: vi.fn(), message: vi.fn() };
    const def = defineWebSocket({ path: '/ws', hooks });
    expect(def.path).toBe('/ws');
    expect(def.hooks).toBe(hooks);
  });

  it('registers WebSocket definitions', () => {
    const def = defineWebSocket({ path: '/chat' });
    registerWebSocket('/chat', def);
    const defs = getWebSocketDefinitions();
    expect(defs.has('/chat')).toBe(true);
  });
});

describe('rooms', () => {
  beforeEach(() => {
    clearWebSocketState();
  });

  function createMockPeer(id: string) {
    const sent: (string | ArrayBuffer | Uint8Array)[] = [];
    const peer = {
      id,
      url: 'http://localhost/ws',
      headers: new Headers(),
      readyState: 1,
      _subscriptions: new Set(),
      _rooms: new Set(),
      send: vi.fn((data: any) => sent.push(data)),
      close: vi.fn(),
      publish: vi.fn(),
      subscribe: vi.fn(function (this: any, topic: string) {
        this._subscriptions.add(topic);
      }),
      unsubscribe: vi.fn(),
      getData: vi.fn(),
      setData: vi.fn(),
      sent
    };
    return peer as any;
  }

  it('creates a room', () => {
    const room = defineRoom('general');
    expect(room.name).toBe('general');
    expect(room.peers.size).toBe(0);
  });

  it('returns same room for same name', () => {
    const room1 = defineRoom('chat');
    const room2 = defineRoom('chat');
    expect(room1).toBe(room2);
  });

  it('adds and removes peers', () => {
    const room = createRoom('test');
    const peer = createMockPeer('p1');
    room.add(peer);
    expect(room.peers.size).toBe(1);
    expect(peer._rooms.has('test')).toBe(true);

    room.remove(peer);
    expect(room.peers.size).toBe(0);
    expect(peer._rooms.has('test')).toBe(false);
  });

  it('broadcasts to all peers in room', () => {
    const room = createRoom('broadcast-test');
    const peer1 = createMockPeer('p1');
    const peer2 = createMockPeer('p2');
    const peer3 = createMockPeer('p3');

    room.add(peer1);
    room.add(peer2);
    room.add(peer3);

    room.broadcast('hello all');

    expect(peer1.send).toHaveBeenCalledWith('hello all');
    expect(peer2.send).toHaveBeenCalledWith('hello all');
    expect(peer3.send).toHaveBeenCalledWith('hello all');
  });

  it('broadcast excludes specified peer', () => {
    const room = createRoom('exclude-test');
    const peer1 = createMockPeer('p1');
    const peer2 = createMockPeer('p2');

    room.add(peer1);
    room.add(peer2);

    room.broadcast('msg', { except: peer1 });
    expect(peer1.send).not.toHaveBeenCalled();
    expect(peer2.send).toHaveBeenCalledWith('msg');
  });

  it('getRoom retrieves existing room', () => {
    createRoom('findable');
    const room = getRoom('findable');
    expect(room).toBeDefined();
    expect(room!.name).toBe('findable');
  });

  it('getRoom returns undefined for non-existent room', () => {
    expect(getRoom('nope')).toBeUndefined();
  });
});

describe('clear state', () => {
  it('clearWebSocketState resets rooms and definitions', () => {
    registerWebSocket('/ws', defineWebSocket({}));
    createRoom('r1');
    clearWebSocketState();
    expect(getWebSocketDefinitions().size).toBe(0);
    expect(getRoom('r1')).toBeUndefined();
  });
});
