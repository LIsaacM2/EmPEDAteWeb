import express from 'express';
import http from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool } from './db.js';
import gameRoutes from './gameRoutes.js';
import { advanceRules, setChallenge, type Challenge, type RoomState } from './gameState.js';
import { releaseGuest, verifyGuest } from './guestSessions.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use('/api/games', gameRoutes);

const PORT = process.env.PORT || 3001;
const rooms = new Map<string, RoomState>();

function emitState(roomCode: string, room: RoomState) {
  io.to(roomCode).emit('update_room_state', {
    roomCode,
    players: room.players.map(({ id, username, score, socketId }) => ({
      id, username, score, connected: socketId !== null
    })),
    hostId: room.hostId,
    hostPlayerId: room.hostPlayerId,
    status: room.status,
    challenge: room.challenge,
    challengeCompleted: room.challengeCompleted,
    turnId: room.turnId,
    assignedPlayerId: room.assignedPlayerId,
    rules: room.rules.map(({ id, challengeContent, targetUsername, remainingRounds }) => ({
      id, challengeContent, targetUsername, remainingRounds
    })),
    timerStatus: room.timerStatus,
    timeLeft: room.timerEndsAt === null ? null : Math.max(0, Math.ceil((room.timerEndsAt - Date.now()) / 1000))
  });
}

function error(socket: Socket, message: string) {
  socket.emit('game_error', { message });
}

function hostRoom(socket: Socket, roomCode: unknown): RoomState | undefined {
  const room = typeof roomCode === 'string' ? rooms.get(roomCode) : undefined;
  if (!room || room.hostId !== socket.id || !room.players.some(player => player.socketId === socket.id)) {
    error(socket, 'Solo el anfitrión de la sala puede realizar esta acción.');
    return undefined;
  }
  return room;
}

async function loadChallenge(): Promise<Challenge> {
  const result = await pool.query('SELECT * FROM challenges ORDER BY RANDOM() LIMIT 1');
  const challenge = result.rows[0];
  if (!challenge) throw new Error('No hay retos disponibles en la base de datos.');
  if ((challenge.duration_type === 'seconds' || challenge.duration_type === 'rounds') &&
      (!Number.isInteger(challenge.duration_value) || challenge.duration_value <= 0)) {
    throw new Error('El reto tiene una duración inválida.');
  }
  return challenge;
}

async function nextChallenge(socket: Socket, roomCode: string, room: RoomState, completed: boolean, restart = false, turnId: string | null = null) {
  if (room.advancing) {
    error(socket, 'Ya se está cargando un reto.');
    return;
  }
  if ((!restart && (room.status !== 'playing' || room.turnId !== turnId || (completed && !room.challenge))) ||
      (restart && room.status !== 'finished')) {
    error(socket, 'No se puede avanzar en el estado actual de la partida.');
    return;
  }
  if (completed && room.challengeCompleted) {
    error(socket, 'Este reto ya fue marcado como cumplido.');
    return;
  }

  room.advancing = true;
  try {
    if (completed) {
      const assigned = room.players.find(p => p.id === room.assignedPlayerId);
      if (!assigned) throw new Error('No se encontró al jugador del reto.');
      assigned.score++;
      room.challengeCompleted = true;
      emitState(roomCode, room);
    }
    const challenge = await loadChallenge();
    if (room.hostId !== socket.id || !socket.connected ||
        (restart ? room.status !== 'finished' : room.status !== 'playing')) return;
    const connected = room.players.filter(player => player.socketId !== null);
    const player = connected[Math.floor(Math.random() * connected.length)];
    if (!player) throw new Error('No hay jugadores conectados.');
    if (restart) {
      room.players.forEach(p => { p.score = 0; });
      room.rules = [];
      room.status = 'playing';
    } else if (room.challenge) {
      advanceRules(room);
    }
    setChallenge(room, challenge, player);
    emitState(roomCode, room);
  } catch (cause) {
    console.error('Error al cargar el reto:', cause);
    error(socket, 'No se pudo cargar el siguiente reto. Inténtalo nuevamente.');
  } finally {
    room.advancing = false;
  }
}

function leaveRoom(socket: Socket, roomCode: string, explicit = false) {
  const room = rooms.get(roomCode);
  const player = room?.players.find(p => p.socketId === socket.id);
  if (!room || !player) return;
  player.socketId = null;
  const token: string | undefined = socket.data.guestTokens?.get(roomCode);
  if (explicit && token) releaseGuest(roomCode, player.id, token);
  socket.data.guestTokens?.delete(roomCode);
  void socket.leave(roomCode);
  if (room.hostId === socket.id) {
    const nextHost = room.players.find(p => p.socketId !== null);
    room.hostId = nextHost?.socketId ?? '';
    room.hostPlayerId = nextHost?.id ?? null;
  }
  emitState(roomCode, room);
}

io.on('connection', socket => {
  socket.on('join_room', async (data: { roomCode: string; userId: string; guestToken: string }, callback?: (result: { error?: string }) => void) => {
    const reject = (message: string) => {
      if (callback) callback({ error: message });
      else error(socket, message);
    };
    if (!data || typeof data.roomCode !== 'string' || typeof data.userId !== 'string' || typeof data.guestToken !== 'string' ||
        !/^\d+$/.test(data.userId)) {
      reject('Datos de sala inválidos.');
      return;
    }
    const { roomCode, userId, guestToken } = data;
    if (!verifyGuest(roomCode, userId, guestToken)) {
      reject('La sesión de invitado no es válida. Vuelve a unirte a la sala.');
      return;
    }
    try {
      const membership = await pool.query(
        `SELECT u.username, (
           SELECT host.user_id::text FROM session_players host
           WHERE host.session_id = s.id AND host.is_host = TRUE
           ORDER BY host.joined_at LIMIT 1
         ) AS host_user_id FROM game_sessions s
         JOIN session_players sp ON sp.session_id = s.id
         JOIN users u ON u.id = sp.user_id
         WHERE s.code = $1 AND s.status = 'waiting' AND u.id = $2`,
        [roomCode, userId]
      );
      if (!socket.connected) return;
      if (!verifyGuest(roomCode, userId, guestToken)) {
        reject('La sesión de invitado ya no es válida. Vuelve a unirte a la sala.');
        return;
      }
      if (!membership.rows[0]) {
        reject('No estás registrado en esta sala.');
        return;
      }

      let room = rooms.get(roomCode);
      if (!room) {
        room = {
          players: [], hostId: '', hostPlayerId: membership.rows[0].host_user_id,
          status: 'playing', challenge: null, challengeCompleted: false, turnId: null,
          assignedPlayerId: null, rules: [], timerEndsAt: null, timerStatus: 'idle', advancing: false
        };
        rooms.set(roomCode, room);
      }
      let player = room.players.find(p => p.id === userId);
      if (player?.socketId && player.socketId !== socket.id) {
        reject('Este nombre ya está conectado en la sala.');
        return;
      }
      if (!player) {
        player = { id: userId, username: membership.rows[0].username, socketId: socket.id, score: 0 };
        room.players.push(player);
      } else {
        player.socketId = socket.id;
      }
      if (room.hostPlayerId === null) room.hostPlayerId = userId;
      if (room.hostPlayerId === userId) room.hostId = socket.id;
      if (!socket.data.guestTokens) socket.data.guestTokens = new Map<string, string>();
      socket.data.guestTokens.set(roomCode, guestToken);
      await socket.join(roomCode);
      if (!socket.connected || player.socketId !== socket.id) return;
      callback?.({});
      emitState(roomCode, room);

      if (!room.challenge && room.status === 'playing' && !room.advancing) {
        room.advancing = true;
        try {
          const challenge = await loadChallenge();
          const connected = room.players.filter(p => p.socketId !== null);
          const assigned = connected[Math.floor(Math.random() * connected.length)];
          if (room.status === 'playing' && !room.challenge && assigned) {
            setChallenge(room, challenge, assigned);
            emitState(roomCode, room);
          }
        } catch (cause) {
          console.error('Error al cargar el reto inicial:', cause);
          io.to(roomCode).emit('game_error', { message: 'No se pudo cargar el reto inicial.' });
        } finally {
          room.advancing = false;
        }
      }
    } catch (cause) {
      console.error('Error al unirse a la sala:', cause);
      reject('No se pudo conectar a la sala.');
    }
  });

  socket.on('request_challenge', (data: { roomCode: string; turnId: string | null }) => {
    if (!data) {
      error(socket, 'Datos de reto inválidos.');
      return;
    }
    const { roomCode, turnId } = data;
    const room = hostRoom(socket, roomCode);
    if (room) void nextChallenge(socket, roomCode, room, false, false, turnId);
  });

  socket.on('complete_challenge', (data: { roomCode: string; turnId: string | null }) => {
    if (!data) {
      error(socket, 'Datos de reto inválidos.');
      return;
    }
    const { roomCode, turnId } = data;
    const room = hostRoom(socket, roomCode);
    if (room) void nextChallenge(socket, roomCode, room, true, false, turnId);
  });

  socket.on('start_timer', (roomCode: string) => {
    const room = hostRoom(socket, roomCode);
    if (!room) return;
    if (room.status !== 'playing' || room.challenge?.duration_type !== 'seconds' || room.timerStatus !== 'idle') {
      error(socket, 'No se puede iniciar el temporizador de este reto.');
      return;
    }
    room.timerEndsAt = Date.now() + room.challenge.duration_value * 1000;
    room.timerStatus = 'running';
    emitState(roomCode, room);
  });

  socket.on('finish_game', (roomCode: string) => {
    const room = hostRoom(socket, roomCode);
    if (!room) return;
    if (room.status !== 'playing') {
      error(socket, 'La partida ya terminó.');
      return;
    }
    room.status = 'finished';
    room.challenge = null;
    room.turnId = null;
    room.assignedPlayerId = null;
    room.rules = [];
    room.timerEndsAt = null;
    room.timerStatus = 'idle';
    emitState(roomCode, room);
  });

  socket.on('start_game', (roomCode: string) => {
    const room = hostRoom(socket, roomCode);
    if (room) void nextChallenge(socket, roomCode, room, false, true);
  });

  socket.on('transfer_host', (data: { roomCode: string; playerId: string }) => {
    if (!data || typeof data.roomCode !== 'string' || typeof data.playerId !== 'string') {
      error(socket, 'Datos de transferencia inválidos.');
      return;
    }
    const room = hostRoom(socket, data.roomCode);
    if (!room) return;
    const target = room.players.find(player => player.id === data.playerId);
    if (!target?.socketId || target.socketId === socket.id) {
      error(socket, 'Selecciona otro jugador conectado.');
      return;
    }
    room.hostId = target.socketId;
    room.hostPlayerId = target.id;
    emitState(data.roomCode, room);
  });

  socket.on('leave_room', (roomCode: string) => {
    if (typeof roomCode === 'string') leaveRoom(socket, roomCode, true);
  });

  socket.on('disconnect', () => {
    for (const roomCode of rooms.keys()) leaveRoom(socket, roomCode);
  });
});

const timer = setInterval(() => {
  for (const [roomCode, room] of rooms) {
    if (room.timerStatus !== 'running' || room.timerEndsAt === null) continue;
    if (Date.now() >= room.timerEndsAt) room.timerStatus = 'finished';
    emitState(roomCode, room);
  }
}, 1000);
timer.unref();

server.listen(PORT, () => {
  console.log(`Servidor corriendo con éxito en http://localhost:${PORT}`);
});

export { io, server };
