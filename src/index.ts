import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';

import { pool } from './db.js';
import gameRoutes from './gameRoutes.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

// Rutas HTTP
app.use('/api/games', gameRoutes);

const PORT = process.env.PORT || 3000;

interface Player {
  id: string;
  username: string;
}

// Interfaz para los efectos activos de un jugador
interface ActiveEffect {
  challengeContent: string;
  remainingRounds: number;
  targetUsername: string;
}

// Estructura ampliada para las salas en memoria
interface RoomState {
  players: Player[];
  activeEffects: Record<string, ActiveEffect>;
  turnIndex: number;
  hostId: string; // Guardamos el socket.id del anfitrión
}

// Memoria de las salas
const rooms: Record<string, RoomState> = {};

io.on('connection', (socket) => {
  console.log(`Nuevo usuario conectado por WebSockets: ${socket.id}`);

  socket.on('join_room', async (data: { roomCode: string; username: string }) => {
    const { roomCode, username } = data;
    socket.join(roomCode);
    
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        activeEffects: {},
        turnIndex: 0,
        hostId: socket.id // El primero que crea/entra es el host inicial
      };
    }

    const room = rooms[roomCode];

    if (!room.players.some(p => p.id === socket.id)) {
      room.players.push({ id: socket.id, username: username || 'Invitado' });
    }

    // Si por alguna razón el host actual se salió o no hay, aseguramos uno
    const firstPlayer = room.players[0];
    if (firstPlayer && !room.players.some(p => p.id === room.hostId)) {
      room.hostId = firstPlayer.id;
    }

    console.log(`Usuario ${username} unido a la sala: ${roomCode}`);
    
    // Emitimos la lista de jugadores y el id del host actual a todos en la sala
    io.to(roomCode).emit('update_room_state', {
      players: room.players,
      hostId: room.hostId
    });

    // Asignar reto inicial automáticamente al entrar
    try {
      const result = await pool.query('SELECT * FROM challenges ORDER BY RANDOM() LIMIT 1');
      if (result.rows.length > 0) {
        const randomChallenge = result.rows[0];
        const players = room.players;
        const randomPlayer = players[Math.floor(Math.random() * players.length)];
        if (!randomPlayer) {
          console.error(`No hay jugadores para asignar el reto en la sala ${roomCode}`);
          return;
        }

        io.to(roomCode).emit('receive_challenge', {
          challenge: randomChallenge,
          assignedTo: randomPlayer.username
        });
      }
    } catch (error) {
      console.error('Error al asignar reto inicial al unirse:', error);
    }
  });  

  socket.on('request_challenge', async (roomCode: string) => {
    try {
      const result = await pool.query('SELECT * FROM challenges ORDER BY RANDOM() LIMIT 1');
      if (result.rows.length > 0) {
        const randomChallenge = result.rows[0];
        
        // Obtenemos los jugadores correctamente de la sala
        const players = rooms[roomCode]?.players;
        const randomPlayer = players?.[Math.floor(Math.random() * players.length)];
        if (!randomPlayer) {
          console.error(`No hay jugadores para asignar el reto en la sala ${roomCode}`);
          return;
        }

        // Mandamos también el tipo y valor de duración al frontend
        io.to(roomCode).emit('receive_challenge', {
          challenge: {
            id: randomChallenge.id,
            content: randomChallenge.content,            // Usando 'content' como definimos
            category: randomChallenge.category,
            intensity_level: randomChallenge.intensity_level,
            duration_type: randomChallenge.duration_type,   // 'normal', 'rounds', o 'seconds'
            duration_value: randomChallenge.duration_value  // Valor numérico (ej. 3 rondas o 30 segundos)
          },
          assignedTo: randomPlayer.username
        });
      }
    } catch (error) {
      console.error('Error al solicitar nuevo reto:', error);
    }
  });

  // Registrar cuando un jugador completa su reto y avisar a la sala
  socket.on('complete_challenge', (data: { roomCode: string; username: string }) => {
    const { roomCode, username } = data;
    console.log(`🎉 ¡${username} completó el reto en la sala ${roomCode}!`);

    io.to(roomCode).emit('challenge_completed', {
      message: `¡${username} cumplió el reto y se ganó un trago! 🥃`
    });
  });

  // Manejar desconexiones
  socket.on('disconnect', () => {
    console.log(`Usuario desconectado: ${socket.id}`);
    
    for (const [roomCode, room] of Object.entries(rooms)) {
      const initialLength = room.players.length;
      
      room.players = room.players.filter((p) => p.id !== socket.id);

      if (room.players.length !== initialLength) {
        // Si el que se fue era el host, pasamos el host al siguiente jugador disponible
        const nextHost = room.players[0];
        if (room.hostId === socket.id && nextHost) {
          room.hostId = nextHost.id;
          console.log(`👑 El host se fue. Nuevo host asignado: ${nextHost.username}`);
        }

        io.to(roomCode).emit('update_room_state', {
          players: room.players,
          hostId: room.hostId
        });
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Servidor corriendo con éxito en http://localhost:${PORT}`);
});