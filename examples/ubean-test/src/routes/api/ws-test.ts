import { defineHandler, defineWebSocket, defineRoom } from 'ubean';
import type { Peer } from 'ubean';

const chatRoom = defineRoom('chat');

export const GET = defineHandler(c => {
  return c.json({
    message: 'WebSocket test endpoint',
    upgradeUrl: '/api/ws-test',
    roomName: 'chat',
    rooms: ['chat'],
    instructions: 'Use a WebSocket client to connect to ws://localhost:3000/api/ws-test'
  });
});

defineWebSocket({
  path: '/api/ws-test',
  hooks: {
    open(peer: Peer) {
      chatRoom.add(peer);
      peer.send(JSON.stringify({ type: 'connected', message: 'Welcome to chat room', peers: chatRoom.peers.size }));
      chatRoom.broadcast(JSON.stringify({ type: 'user-joined', peerId: peer.id }), { except: peer });
    },
    message(peer: Peer, message: string | ArrayBuffer) {
      const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
      chatRoom.broadcast(JSON.stringify({ type: 'message', from: peer.id, text, timestamp: Date.now() }));
    },
    close(peer: Peer) {
      chatRoom.remove(peer);
      chatRoom.broadcast(JSON.stringify({ type: 'user-left', peerId: peer.id }));
    },
    error(peer: Peer, error: Error) {
      console.error('[ws-test] WebSocket error:', error);
    }
  }
});
