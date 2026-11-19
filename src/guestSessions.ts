import { randomBytes, timingSafeEqual } from 'node:crypto';

// Las credenciales temporales vinculan cada invitado a una sala sin exigir un login.
const credentials = new Map<string, Map<string, string>>();

export function claimGuest(roomCode: string, userId: string, token?: string): { token: string; created: boolean } | null {
  let room = credentials.get(roomCode);
  if (!room) {
    room = new Map();
    credentials.set(roomCode, room);
  }
  const existing = room.get(userId);
  if (existing) {
    return token && verifyGuest(roomCode, userId, token) ? { token: existing, created: false } : null;
  }
  const newToken = randomBytes(32).toString('hex');
  room.set(userId, newToken);
  return { token: newToken, created: true };
}

export function verifyGuest(roomCode: string, userId: string, token: string): boolean {
  const existing = credentials.get(roomCode)?.get(userId);
  if (!existing || !/^[a-f0-9]{64}$/.test(token)) return false;
  return timingSafeEqual(Buffer.from(existing, 'hex'), Buffer.from(token, 'hex'));
}

export function releaseGuest(roomCode: string, userId: string, token: string): void {
  const room = credentials.get(roomCode);
  if (!room || !verifyGuest(roomCode, userId, token)) return;
  room.delete(userId);
  if (room.size === 0) credentials.delete(roomCode);
}
