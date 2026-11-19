import { io, Socket } from 'socket.io-client';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const socket: Socket = io(API_URL, {
  autoConnect: true,
});