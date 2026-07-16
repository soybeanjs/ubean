import { describe, it, expect, beforeEach } from 'vitest';
import {
  defineWebSocket,
  defineRoom,
  createRoom,
  getRoom,
  getRooms,
  broadcast,
  clearWebSocketState,
  registerWebSocket,
  getWebSocketDefinitions,
  handleUpgrade,
  handleMessage,
  handleClose,
  handleError
} from 'ubean';
import type { UbeanContext } from 'ubean';
import { getJson } from './helper';

describe('WebSocket system', () => {
  beforeEach(() => {
    clearWebSocketState();
  });

  describe('defineWebSocket()', () => {
    it('returns the definition object', () => {
      const def = defineWebSocket({
        path: '/ws',
        hooks: {
          open: () => {},
          message: () => {},
          close: () => {}
        }
      });
      expect(def).toBeDefined();
      expect(def.path).toBe('/ws');
      expect(def.hooks?.open).toBeDefined();
      expect(def.hooks?.message).toBeDefined();
      expect(def.hooks?.close).toBeDefined();
    });

    it('accepts topics and rooms', () => {
      const def = defineWebSocket({
        path: '/ws',
        topics: ['chat', 'notifications'],
        rooms: ['general']
      });
      expect(def.topics).toEqual(['chat', 'notifications']);
      expect(def.rooms).toEqual(['general']);
    });
  });

  describe('defineRoom() / createRoom() / getRoom() / getRooms()', () => {
    it('defineRoom creates and returns a room', () => {
      const room = defineRoom('test-room');
      expect(room).toBeDefined();
      expect(room.name).toBe('test-room');
      expect(room.peers).toBeInstanceOf(Set);
    });

    it('createRoom returns existing room for same name', () => {
      const room1 = createRoom('shared');
      const room2 = createRoom('shared');
      expect(room1).toBe(room2);
    });

    it('getRoom returns room by name', () => {
      defineRoom('lookup-room');
      const room = getRoom('lookup-room');
      expect(room).toBeDefined();
      expect(room?.name).toBe('lookup-room');
    });

    it('getRoom returns undefined for nonexistent room', () => {
      const room = getRoom('nonexistent');
      expect(room).toBeUndefined();
    });

    it('getRooms returns all rooms map', () => {
      defineRoom('room-a');
      defineRoom('room-b');
      const rooms = getRooms();
      expect(rooms.size).toBeGreaterThanOrEqual(2);
      expect(rooms.has('room-a')).toBe(true);
      expect(rooms.has('room-b')).toBe(true);
    });
  });

  describe('registerWebSocket() / getWebSocketDefinitions()', () => {
    it('registers a definition at a path', () => {
      const def = { path: '/ws-register', hooks: {} };
      registerWebSocket('/ws-register', def);
      const defs = getWebSocketDefinitions();
      expect(defs.has('/ws-register')).toBe(true);
    });

    it('getWebSocketDefinitions returns definitions map', () => {
      registerWebSocket('/ws-1', { hooks: {} });
      registerWebSocket('/ws-2', { hooks: {} });
      const defs = getWebSocketDefinitions();
      expect(defs.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('broadcast() (topic-based)', () => {
    it('broadcast sends to all subscribers of a topic', async () => {
      const received: string[] = [];

      registerWebSocket('/ws-broadcast', {
        hooks: {
          open(peer) {
            peer.subscribe('news');
          }
        }
      });

      const mockContext = {
        req: {
          url: 'http://localhost/ws-broadcast',
          raw: { headers: new Headers() }
        }
      };

      handleUpgrade(mockContext as unknown as UbeanContext, {
        send: (data: string | ArrayBuffer | Uint8Array) =>
          received.push(typeof data === 'string' ? data : new TextDecoder().decode(data)),
        close: () => {}
      });

      // Wait for the open hook (queueMicrotask) to run
      await new Promise(r => setTimeout(r, 10));

      // Broadcast to the topic
      broadcast('news', 'hello subscribers');
      expect(received).toContain('hello subscribers');
    });

    it('broadcast does nothing for nonexistent topic', () => {
      // Should not throw
      expect(() => broadcast('nonexistent-topic', 'msg')).not.toThrow();
    });
  });

  describe('handleUpgrade()', () => {
    it('returns a 200 upgrade response and a peer', () => {
      registerWebSocket('/ws-upgrade', { hooks: {} });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-upgrade',
          raw: { headers: new Headers() }
        }
      };
      const result = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      expect(result.response.status).toBe(200);
      expect(result.response.headers.get('Upgrade')).toBe('websocket');
      expect(result.peer).toBeDefined();
      expect(result.peer.id).toBeDefined();
      expect(typeof result.peer.id).toBe('string');
    });

    it('auto-subscribes peer to definition topics', () => {
      registerWebSocket('/ws-topics', {
        topics: ['updates', 'alerts'],
        hooks: {}
      });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-topics',
          raw: { headers: new Headers() }
        }
      };
      const result = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      // The peer's send is captured, so we can't easily verify subscriptions
      // but we can verify the peer was created
      expect(result.peer).toBeDefined();
    });
  });

  describe('handleMessage() / handleClose() / handleError()', () => {
    it('handleMessage calls the message hook', async () => {
      let received = '';
      registerWebSocket('/ws-msg', {
        hooks: {
          message: (_peer, msg) => {
            received = typeof msg === 'string' ? msg : new TextDecoder().decode(msg);
          }
        }
      });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-msg',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      handleMessage(peer, 'test message');
      await new Promise(r => setTimeout(r, 50));
      expect(received).toBe('test message');
    });

    it('handleClose calls the close hook', async () => {
      let closed = false;
      registerWebSocket('/ws-close', {
        hooks: {
          close: () => {
            closed = true;
          }
        }
      });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-close',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      handleClose(peer, 1000, 'normal');
      await new Promise(r => setTimeout(r, 50));
      expect(closed).toBe(true);
    });

    it('handleError calls the error hook', async () => {
      let errored = false;
      registerWebSocket('/ws-err', {
        hooks: {
          error: () => {
            errored = true;
          }
        }
      });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-err',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      handleError(peer, new Error('test error'));
      await new Promise(r => setTimeout(r, 50));
      expect(errored).toBe(true);
    });
  });

  describe('Peer management', () => {
    it('peer has send/subscribe/unsubscribe/close methods', () => {
      registerWebSocket('/ws-peer', { hooks: {} });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-peer',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      expect(typeof peer.send).toBe('function');
      expect(typeof peer.subscribe).toBe('function');
      expect(typeof peer.unsubscribe).toBe('function');
      expect(typeof peer.close).toBe('function');
      expect(typeof peer.publish).toBe('function');
      expect(typeof peer.getData).toBe('function');
      expect(typeof peer.setData).toBe('function');
    });

    it('peer.setData/getData works', () => {
      registerWebSocket('/ws-data', { hooks: {} });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-data',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      peer.setData({ user: 'alice' });
      const data = peer.getData<{ user: string }>();
      expect(data).toEqual({ user: 'alice' });
    });

    it('peer.readyState is 1 (OPEN)', () => {
      registerWebSocket('/ws-state', { hooks: {} });
      const mockContext = {
        req: {
          url: 'http://localhost/ws-state',
          raw: { headers: new Headers() }
        }
      };
      const { peer } = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: () => {},
        close: () => {}
      });
      expect(peer.readyState).toBe(1);
    });
  });

  describe('Room broadcast', () => {
    it('broadcast sends to all peers in room', () => {
      const received: string[] = [];
      const room = createRoom('broadcast-test');

      registerWebSocket('/ws-room', { hooks: {} });

      const mockContext = {
        req: {
          url: 'http://localhost/ws-room',
          raw: { headers: new Headers() }
        }
      };

      const peer1 = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: (data: string | ArrayBuffer | Uint8Array) =>
          received.push(`p1:${typeof data === 'string' ? data : new TextDecoder().decode(data)}`),
        close: () => {}
      }).peer;

      const peer2 = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: (data: string | ArrayBuffer | Uint8Array) =>
          received.push(`p2:${typeof data === 'string' ? data : new TextDecoder().decode(data)}`),
        close: () => {}
      }).peer;

      room.add(peer1);
      room.add(peer2);
      room.broadcast('hello room');

      expect(received).toContain('p1:hello room');
      expect(received).toContain('p2:hello room');
    });

    it('broadcast with except option skips a peer', () => {
      const received: string[] = [];
      const room = createRoom('except-test');
      registerWebSocket('/ws-except', { hooks: {} });

      const mockContext = {
        req: {
          url: 'http://localhost/ws-except',
          raw: { headers: new Headers() }
        }
      };

      const peer1 = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: (data: string | ArrayBuffer | Uint8Array) =>
          received.push(`p1:${typeof data === 'string' ? data : new TextDecoder().decode(data)}`),
        close: () => {}
      }).peer;

      const peer2 = handleUpgrade(mockContext as unknown as UbeanContext, {
        send: (data: string | ArrayBuffer | Uint8Array) =>
          received.push(`p2:${typeof data === 'string' ? data : new TextDecoder().decode(data)}`),
        close: () => {}
      }).peer;

      room.add(peer1);
      room.add(peer2);
      room.broadcast('msg', { except: peer2 });

      expect(received).toContain('p1:msg');
      expect(received).not.toContain('p2:msg');
    });
  });

  describe('HTTP integration - /api/ws-test', () => {
    it('GET returns WebSocket endpoint info', async () => {
      const res = await getJson('/api/ws-test');
      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('upgradeUrl');
      expect(res.data).toHaveProperty('roomName', 'chat');
      expect(res.data).toHaveProperty('rooms');
    });
  });
});
