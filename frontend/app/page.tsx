'use client';
import { useState, useEffect, useSyncExternalStore } from 'react';
import { socket } from '@/lib/socket';

interface Challenge {
  id: number;
  content: string;
  category: string;
  intensity_level: number;
  duration_type: string;  // 'normal', 'rounds', o 'seconds'
  duration_value: number; // Valor numérico
}

interface Player {
  id: string;
  username: string;
}

function subscribeToConnection(onChange: () => void) {
  socket.on('connect', onChange);
  socket.on('disconnect', onChange);
  return () => {
    socket.off('connect', onChange);
    socket.off('disconnect', onChange);
  };
}

export default function Home() {
  const isConnected = useSyncExternalStore(subscribeToConnection, () => socket.connected, () => false);
  const [username, setUsername] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Nuevos estados para juego en vivo
  const [players, setPlayers] = useState<Player[]>([]);
  const [currentChallenge, setCurrentChallenge] = useState<Challenge | null>(null);
  const [assignedPlayer, setAssignedPlayer] = useState<string>('');

  // Estado para llevar la cuenta regresiva en segundos
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [hostId, setHostId] = useState<string>('');
  const isHost = socket.id === hostId;

  useEffect(() => {
    socket.on('update_players', (roomPlayers: Player[]) => {
      setPlayers(roomPlayers);
    });

    socket.on('receive_challenge', (data: { challenge: Challenge; assignedTo: string }) => {
      setCurrentChallenge(data.challenge);
      setAssignedPlayer(data.assignedTo);

      // Si el reto es de segundos, inicializamos el contador
      if (data.challenge.duration_type === 'seconds') {
        setTimeLeft(data.challenge.duration_value);
      } else {
        setTimeLeft(null);
      }
    });

    // Escuchar cuando alguien completa el reto
    socket.on('challenge_completed', (data: { message: string }) => {
      alert(data.message);
    });

    socket.on('update_room_state', (data: { players: Player[]; hostId: string }) => {
      setPlayers(data.players);
      setHostId(data.hostId);
    });

    return () => {
      socket.off('update_players');
      socket.off('receive_challenge');
      socket.off('challenge_completed');
      socket.off('update_room_state');
    };
  }, []);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev !== null && prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [timeLeft]);

  const handleCreateRoom = async () => {
    if (!username) {
      setErrorMsg('Por favor escribe tu nombre de usuario');
      return;
    }
    setErrorMsg('');

    try {
      const res = await fetch('http://localhost:3000/api/games/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1 }),
      });

      const data = await res.json();
      if (res.ok) {
        const generatedCode = data.session?.code || data.code;
        setRoomCode(generatedCode);
        setInRoom(true);
        socket.emit('join_room', { roomCode: generatedCode, username });
      } else {
        setErrorMsg(data.error || 'Error al crear la sala');
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
      const res = await fetch('http://localhost:3000/api/games/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId: 2 }),
      });

      const data = await res.json();
      if (res.ok) {
        setRoomCode(code);
        setInRoom(true);
        socket.emit('join_room', { roomCode: code, username });
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
            🍺 Tequila Game
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
              <p className="text-xs font-bold text-slate-400 uppercase mb-2">Jugadores en la sala ({players.length}):</p>
              <div className="flex flex-wrap gap-2">
                {players.map((p) => (
                  <span key={p.id} className="text-xs bg-purple-950/80 border border-purple-800 text-purple-200 px-3 py-1 rounded-full font-medium">
                    {p.username} {p.username === username ? '(Tú)' : ''}
                  </span>
                ))}
              </div>
            </div>

            {/* Sección para mostrar efectos activos por ronda de los jugadores */}
            <div className="bg-slate-900/60 border border-slate-800 p-3 rounded-xl text-left space-y-2">
              <p className="text-xs font-bold text-amber-400 uppercase tracking-wider">🔄 Efectos Activos en la Sala:</p>
              {/* Aquí mapearemos los efectos activos que lleguen del servidor */}
              <div className="space-y-1">
                <div className="text-xs bg-amber-950/40 border border-amber-900/60 text-amber-200 px-3 py-1.5 rounded-lg flex justify-between items-center">
                  <span><strong>Carlos:</strong> No decir la letra &quot;A&quot;</span>
                  <span className="font-bold text-amber-400">2 rondas restantes</span>
                </div>
              </div>
            </div>

            {/* Tarjeta del Reto */}
            <div className="bg-slate-800 p-6 rounded-2xl shadow-xl space-y-4 border border-slate-700">
              {currentChallenge ? (
                <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-xs uppercase tracking-wider bg-purple-900/50 text-purple-300 px-2.5 py-1 rounded-full font-semibold">
                      {currentChallenge.category} (Nivel {currentChallenge.intensity_level})
                    </span>
                    <span className="text-sm font-bold text-pink-400">
                      Asignado a: {assignedPlayer}
                    </span>
                  </div>

                  <p className="text-xl font-medium text-white text-center py-2">
                    {currentChallenge.content}
                  </p>

                  {/* Muestra la cuenta regresiva dinámica */}
                  {currentChallenge.duration_type === 'seconds' && (
                    <div className={`p-3 rounded-lg text-center font-bold transition-all ${timeLeft === 0
                      ? 'bg-rose-900 border border-rose-600 text-white animate-bounce'
                      : 'bg-red-950/40 border border-red-800/60 text-red-300 animate-pulse'
                      }`}>
                      {timeLeft !== null && timeLeft > 0 ? (
                        <span>⏱️ ¡Tiempo restante: <strong className="text-xl font-mono">{timeLeft}</strong> segundos!</span>
                      ) : (
                        <span>⏰ ¡Se acabó el tiempo! ¡A beber 🥃!</span>
                      )}
                    </div>
                  )}

                  {/* Panel exclusivo del Anfitrión / Host */}
                  {isHost && (
                    <div className="bg-purple-950/40 border border-purple-800/60 p-4 rounded-xl space-y-2 text-left">
                      <p className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1">
                        👑 Controles de Anfitrión (Host)
                      </p>
                      <button
                        onClick={() => {
                          // Aquí dispararemos el evento de terminar ronda o cambiar opciones
                          alert('Funcionalidad de finalizar ronda en camino');
                        }}
                        className="w-full bg-purple-700 hover:bg-purple-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow"
                      >
                        🏁 Finalizar Ronda y Ver Podio
                      </button>
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

              <button
                onClick={() => socket.emit('request_challenge', roomCode)}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold py-3 px-4 rounded-xl shadow-lg transition-all transform active:scale-95"
              >
                🎲 ¡Siguiente Reto / Verdad!
              </button>

              {/* Botón para marcar el reto como cumplido y beber */}
              <button
                onClick={() => socket.emit('complete_challenge', { roomCode, username })}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-md transition-all text-sm active:scale-95"
              >
                ¡Reto Cumplido (Beber)!
              </button>

              <button
                onClick={() => setInRoom(false)}
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