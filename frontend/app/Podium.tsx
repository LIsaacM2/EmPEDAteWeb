export interface PodiumPlayer {
  id: string;
  username: string;
  score: number;
}

const crowns = [
  { color: 'text-yellow-400', label: 'Primer lugar, corona de oro' },
  { color: 'text-slate-300', label: 'Segundo lugar, corona de plata' },
  { color: 'text-amber-700', label: 'Tercer lugar, corona de bronce' },
];

export function Podium({ players }: { players: PodiumPlayer[] }): React.JSX.Element {
  // El nombre mantiene estable el orden de los jugadores con la misma puntuación.
  const ranking = [...players].sort((a, b) => b.score - a.score || a.username.localeCompare(b.username));

  return (
    <ol className="space-y-2 text-left">
      {ranking.map((player, index) => {
        const crown = crowns[index];
        return (
          <li key={player.id} className="flex justify-between rounded-lg bg-slate-900 px-4 py-2">
            <span className="flex items-center gap-2">
              {crown ? (
                <svg role="img" aria-label={crown.label} viewBox="0 0 24 24" fill="currentColor"
                  className={`h-6 w-6 shrink-0 ${crown.color}`}>
                  <path d="M2 5l5 4 5-6 5 6 5-4-2 12H4L2 5zm2 14h16v2H4v-2z" />
                </svg>
              ) : (
                <span>{index + 1}.</span>
              )}
              {player.username}
            </span>
            <strong>{player.score} {player.score === 1 ? 'punto' : 'puntos'}</strong>
          </li>
        );
      })}
    </ol>
  );
}
import * as React from 'react';

