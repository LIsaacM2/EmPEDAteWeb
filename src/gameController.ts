import {type Request, type Response } from 'express';
import { pool } from './db.js';

// Función para generar un código aleatorio de sala (ej. "A4F2")
function generateRoomCode(): string {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 1. Endpoint para crear una nueva sala de juego
export async function createGameSession(req: Request, res: Response) {
  const { username } = req.body;
  let { userId } = req.body;

  if (!userId && (typeof username !== 'string' || !username.trim())) {
    return res.status(400).json({ error: 'Se requiere el nombre o userId del anfitrión' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN'); // Iniciamos una transacción SQL

    if (!userId) {
      const user = await client.query(
        `INSERT INTO users (username) VALUES ($1)
         ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`,
        [username.trim()]
      );
      userId = user.rows[0].id;
    }
    const roomCode = generateRoomCode();

    // Creamos la sesión de juego
    const sessionQuery = `
      INSERT INTO game_sessions (code, status) 
      VALUES ($1, 'waiting') 
      RETURNING id, code, status, created_at;
    `;
    const sessionResult = await client.query(sessionQuery, [roomCode]);
    const newSession = sessionResult.rows[0];

    // Añadimos al usuario creador como host en la tabla intermedia session_players
    const playerQuery = `
      INSERT INTO session_players (session_id, user_id, score, is_host) 
      VALUES ($1, $2, 0, TRUE);
    `;
    await client.query(playerQuery, [newSession.id, userId]);

    await client.query('COMMIT'); // Confirmamos la transacción

    return res.status(201).json({
      message: '¡Sala de juego creada con éxito!',
      session: newSession,
      userId
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al crear la sesión de juego:', error);
    return res.status(500).json({ error: 'Error interno al crear la sala' });
  } finally {
    client?.release();
  }
}

// 2. Endpoint para unirse a una sala existente mediante el código
export async function joinGameSession(req: Request, res: Response) {
  const { code, username } = req.body;
  let { userId } = req.body;

  if (typeof code !== 'string' || !code.trim() ||
      (!userId && (typeof username !== 'string' || !username.trim()))) {
    return res.status(400).json({ error: 'Se requiere el código de la sala y el nombre o userId' });
  }

  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    // 1. Buscamos si la sala existe y está en estado de espera
    const sessionResult = await client.query(
      "SELECT id, status FROM game_sessions WHERE code = $1 AND status = 'waiting'",
      [code]
    );

    if (sessionResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Sala no encontrada o la partida ya comenzó' });
    }

    const session = sessionResult.rows[0];
    if (!userId) {
      const user = await client.query(
        `INSERT INTO users (username) VALUES ($1)
         ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id`,
        [username.trim()]
      );
      userId = user.rows[0].id;
    }

    // 2. Verificamos si el usuario ya está en esta sala para evitar duplicados
    const existingPlayer = await client.query(
      "SELECT id FROM session_players WHERE session_id = $1 AND user_id = $2",
      [session.id, userId]
    );

    // 3. Unimos al jugador a la sala
    if (existingPlayer.rows.length === 0) {
      await client.query(
        `INSERT INTO session_players (session_id, user_id, score, is_host)
         VALUES ($1, $2, 0, FALSE)`,
        [session.id, userId]
      );
    }
    await client.query('COMMIT');

    return res.status(200).json({
      message: '¡Te has unido a la sala exitosamente!',
      sessionId: session.id,
      code: code,
      userId
    });

  } catch (error) {
    if (client) await client.query('ROLLBACK');
    console.error('Error al unirse a la sala:', error);
    return res.status(500).json({ error: 'Error interno al unirse a la sala' });
  } finally {
    client?.release();
  }
}