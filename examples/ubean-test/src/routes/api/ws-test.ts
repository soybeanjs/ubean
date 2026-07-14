import { defineHandler, defineWebSocket, defineRoom } from 'ubean';

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
  open(peer) {
    chatRoom.add(peer);
    peer.send({ type: 'connected', message: 'Welcome to chat room', peers: chatRoom.size });
    chatRoom.broadcast({ type: 'user-joined', peerId: peer.id }, peer.id);
  },
  message(peer, message) {
    const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
    chatRoom.broadcast({ type: 'message', from: peer.id, text, timestamp: Date.now() });
  },
  close(peer) {
    chatRoom.remove(peer);
    chatRoom.broadcast({ type: 'user-left', peerId: peer.id });
  },
  error(peer, error) {
    console.error('[ws-test] WebSocket error:', error);
  }
});
