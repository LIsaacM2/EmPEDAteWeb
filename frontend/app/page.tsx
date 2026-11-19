'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { API_URL, socket } from '@/lib/socket';
import { Podium, type PodiumPlayer } from './Podium';

interface Challenge {
  id: string | number;
  content: string;
  category: string;
  intensity_level: number;
  duration_type: string;  // 'normal', 'rounds', o 'seconds'
  duration_value: number; // Valor numérico
}

interface Player extends PodiumPlayer {
  connected: boolean;
}

interface ActiveRule {
  id: string;
  challengeContent: string;
  targetUsername: string;
  remainingRounds: number;
}

interface RoomState {
  roomCode: string;
  players: Player[];
  hostId: string;
  hostPlayerId: string | null;
  status: 'playing' | 'finished';
  challenge: Challenge | null;
  challengeCompleted: boolean;
  turnId: string | null;
  assignedPlayerId: string | null;
  rules: ActiveRule[];
  timerStatus: 'idle' | 'running' | 'finished';
  timeLeft: number | null;
}

function subscribeToConnection(onChange: () => void) {
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

function guestStorageKey(code: string, name: string) {
  // La credencial es distinta para cada nombre y sala, incluso en el mismo navegador.
  return `empedate:guest:${code}:${name.trim()}`;
}

export default function Home() {
  const isConnected = useSyncExternalStore(subscribeToConnection, () => socket.connected, () => false);
  const [username, setUsername] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [userId, setUserId] = useState('');
  const [guestToken, setGuestToken] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [room, setRoom] = useState<RoomState | null>(null);
  const players = room?.players ?? [];
  const currentChallenge = room?.challenge;
  const assignedPlayer = players.find(player => player.id === room?.assignedPlayerId);
  const isHost = socket.id === room?.hostId;

  // El servidor envía la instantánea completa de la sala y los errores de juego.
  useEffect(() => {
    const onState = (state: RoomState) => {
      if (state.roomCode === roomCode) setRoom(state);
    };
    const onError = (data: { message: string }) => setErrorMsg(data.message);
    socket.on('update_room_state', onState);
    socket.on('game_error', onError);

    return () => {
      socket.off('update_room_state', onState);
      socket.off('game_error', onError);
    };
  }, [roomCode]);

  // Reutiliza la credencial del invitado al reconectarse, sin crear otra membresía.
  useEffect(() => {
    if (!inRoom || !roomCode || !userId || !guestToken) return;
    const join = () => {
      socket.emit('join_room', { roomCode, userId, guestToken }, (result: { error?: string }) => {
        if (result.error) {
          setErrorMsg(result.error);
          setInRoom(false);
        }
      });
    };
    socket.on('connect', join);
    if (socket.connected) join();
    return () => { socket.off('connect', join); };
  }, [inRoom, roomCode, userId, guestToken]);

  const handleCreateRoom = async () => {
    if (!username) {
      setErrorMsg('Por favor escribe tu nombre de usuario');
      return;
    }
    setErrorMsg('');

    try {
      const res = await fetch(`${API_URL}/api/games/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        const generatedCode = data.session?.code || data.code;
        if (typeof generatedCode !== 'string' || typeof data.guestToken !== 'string' || !data.userId) {
          setErrorMsg('El servidor no tiene la versión actual. Reinicia el backend e inténtalo de nuevo.');
          return;
        }
        localStorage.setItem(guestStorageKey(generatedCode, username), data.guestToken);
        setRoomCode(generatedCode);
        setUserId(String(data.userId));
        setGuestToken(data.guestToken);
        setInRoom(true);
      } else {
        setErrorMsg(data.error === 'Se requiere el userId del anfitrión'
          ? 'El backend está desactualizado. Reinícialo e inténtalo de nuevo.'
          : data.error || 'Error al crear la sala');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo conectar con el servidor');
    }
  };

  const handleJoinRoom = async () => {
    if (!username || !inputCode) {
      setErrorMsg('Escribe tu nombre y el código de la sala');
      return;
    }
    setErrorMsg('');

    try {
      const code = inputCode.toUpperCase();
      const savedToken = localStorage.getItem(guestStorageKey(code, username));
      const res = await fetch(`${API_URL}/api/games/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, username: username.trim(), ...(savedToken ? { guestToken: savedToken } : {}) }),
      });

      const data = await res.json();
      if (res.ok) {
        if (typeof data.guestToken !== 'string' || !data.userId) {
          setErrorMsg('El servidor no tiene la versión actual. Reinicia el backend e inténtalo de nuevo.');
          return;
        }
        localStorage.setItem(guestStorageKey(code, username), data.guestToken);
        setRoomCode(code);
        setUserId(String(data.userId));
        setGuestToken(data.guestToken);
        setInRoom(true);
      } else {
        setErrorMsg(data.error || 'Error al unirse a la sala');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('No se pudo conectar con el servidor');
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl">

        {/* Encabezado y Estado */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-500">
            🍺 EmPEDAte
          </h1>
          <div className="flex items-center gap-2 bg-slate-800 px-3 py-1 rounded-full border border-slate-700">
            <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            <span className="text-xs text-slate-300 font-medium">
              {isConnected ? 'En línea' : 'Desconectado'}
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 bg-rose-950 border border-rose-800 text-rose-200 text-sm rounded-xl">
            {errorMsg}
          </div>
        )}

        {!inRoom ? (
          /* VISTA DE MENÚ */
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tu Apodo / Nombre</label>
              <input
                type="text"
                placeholder="Ej. Carlos"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <button
              onClick={handleCreateRoom}
              className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95"
            >
              Crear Nueva Sala
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-500 text-xs uppercase">o unirse</span>
              <div className="flex-grow border-t border-slate-800"></div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Código de Sala</label>
              <input
                type="text"
                placeholder="Ej. 1G6G"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white uppercase tracking-widest font-mono focus:outline-none focus:border-purple-500 transition-colors"
              />
            </div>

            <button
              onClick={handleJoinRoom}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-purple-300 font-bold py-3 px-4 rounded-xl transition-all"
            >
              Unirse a Sala Existente
            </button>
          </div>
        ) : (
          /* VISTA DEL LOBBY Y JUEGO EN VIVO */
          <div className="text-center space-y-5">
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-2xl flex justify-between items-center">
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider">Sala Activa</p>
                <h2 className="text-2xl font-mono font-extrabold text-purple-400">{roomCode}</h2>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400">Jugador</span>
                <p className="text-sm font-bold text-white">{username}</p>
              </div>
            </div>

            {/* Lista de jugadores conectados en tiempo real */}
            <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-left">
              <p className="text-xs font-bold text-slate-400 uppercase mb-2">Jugadores en la sala ({players.filter(p => p.connected).length}):</p>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <div key={p.id} className="text-xs bg-purple-950/80 border border-purple-800 text-purple-200 px-3 py-1 rounded-xl font-medium">
                    <span>{p.id === room?.hostPlayerId ? '👑 ' : ''}{p.username} {p.id === userId ? '(Tú)' : ''} {!p.connected ? '(Desconectado)' : ''} · {p.score} pts</span>
                    {isHost && p.id !== userId && p.connected && (
                      <button
                        type="button"
                        onClick={() => socket.emit('transfer_host', { roomCode, playerId: p.id })}
                        disabled={!isConnected}
                        className="ml-2 underline text-purple-300 hover:text-white disabled:opacity-50"
                        aria-label={`Hacer anfitrión a ${p.username}`}
                      >
                        Hacer anfitrión
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {room?.status === 'playing' && (
              <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-left space-y-2">
                <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">🔄 Reglas Activas en la Sala:</p>
                {room.rules.length === 0 ? (
                  <p className="text-xs text-slate-400">No hay reglas activas.</p>
                ) : room.rules.map(rule => (
                  <div key={rule.id} className="text-xs bg-amber-950/40 border border-amber-900/60 text-amber-200 px-3 py-1.5 rounded-lg flex justify-between items-center gap-2">
                    <span><strong>{rule.targetUsername}:</strong> {rule.challengeContent}</span>
                    <span className="font-bold text-amber-400">{rule.remainingRounds} {rule.remainingRounds === 1 ? 'ronda restante' : 'rondas restantes'}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-slate-800 p-6 rounded-2xl shadow-xl space-y-4 border border-slate-700">
              {room?.status === 'finished' ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-amber-400">🏆 Podio final</h3>
                  <Podium players={players} />
                  <p className="text-sm text-slate-400">La sala sigue abierta para nuevos participantes.</p>
                  {isHost && (
                    <button onClick={() => socket.emit('start_game', roomCode)} disabled={!isConnected}
                      className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-3 rounded-xl">
                      Iniciar nueva partida
                    </button>
                  )}
                </div>
              ) : currentChallenge ? (
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wider bg-purple-900/50 text-purple-300 px-2.5 py-1 rounded-full font-semibold">
                      {currentChallenge.category} (Nivel {currentChallenge.intensity_level})
                    </span>
                    <span className="text-sm font-bold text-pink-400">
                      Asignado a: {assignedPlayer?.username ?? 'Jugador desconectado'}
                    </span>
                  </div>

                  <p className="text-xl font-medium text-white text-center py-2">
                    {currentChallenge.content}
                  </p>

                  {currentChallenge.duration_type === 'seconds' && (
                    <div className={`p-3 rounded-lg text-center font-bold transition-all ${room?.timerStatus === 'finished'
                      ? 'bg-rose-900 border border-rose-600 text-white animate-bounce'
                      : 'bg-red-950/40 border border-red-800/60 text-red-300 animate-pulse'
                      }`}>
                      {room?.timerStatus === 'finished' ? (
                        <span>⏰ ¡Se acabó el tiempo!</span>
                      ) : (
                        <span>⏱️ Tiempo restante: <strong className="text-xl font-mono">{room?.timeLeft ?? currentChallenge.duration_value}</strong> segundos</span>
                      )}
                      {room?.timerStatus === 'idle' && isHost && (
                        <button onClick={() => socket.emit('start_timer', roomCode)} disabled={!isConnected}
                          className="block w-full mt-2 bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white py-2 rounded-lg">
                          Iniciar cuenta regresiva
                        </button>
                      )}
                    </div>
                  )}

                  {currentChallenge.duration_type === 'rounds' && (
                    <div className="bg-amber-950/40 border border-amber-800/60 p-3 rounded-lg text-center text-amber-300 font-bold">
                      🔄 Efecto activo por las próximas {currentChallenge.duration_value} rondas
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-center text-slate-400 py-4">Esperando el primer reto...</p>
              )}

              {room?.status === 'playing' && isHost && (
                <div className="space-y-2">
                  <button
                    onClick={() => socket.emit('request_challenge', { roomCode, turnId: room.turnId })}
                    disabled={!isConnected}
                    className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl"
                  >
                    🎲 Siguiente Reto / Verdad
                  </button>
                  <button
                    onClick={() => socket.emit('complete_challenge', { roomCode, turnId: room.turnId })}
                    disabled={!isConnected || !currentChallenge || room.challengeCompleted}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl"
                  >
                    Reto cumplido (+1 punto)
                  </button>
                  <button
                    onClick={() => socket.emit('finish_game', roomCode)}
                    disabled={!isConnected}
                    className="w-full bg-purple-700 hover:bg-purple-600 disabled:opacity-50 text-white font-bold py-2 px-3 rounded-lg"
                  >
                    Finalizar Juego
                  </button>
                </div>
              )}

              <button
                onClick={() => {
                  if (socket.connected) socket.emit('leave_room', roomCode);
                  setInRoom(false);
                  setRoom(null);
                }}
                className="text-sm text-slate-500 hover:text-slate-300 underline transition-colors block mx-auto"
              >
                Salir de la sala
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}