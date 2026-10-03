// A race's final standings: finishers by time (penalties included), then everyone else by squares correct.
import type { Player } from './protocol';
import { formatTime, type Standing } from './race';

export function Standings({ standings, player, me }: { standings: Standing[]; player: (id: string) => Player | undefined; me?: string }) {
  return (
    <ol class="standings">
      {standings.map(s => (
        <li value={s.place} class={s.id === me ? 'me' : ''}>
          <span class="dot" style={{ background: player(s.id)?.color }} />
          {player(s.id)?.name ?? 'Someone'}
          <span class="time">
            {s.timeMs !== null
              ? `${formatTime(s.timeMs)}${s.penaltyMs > 0 ? ` (incl. +${formatTime(s.penaltyMs)})` : ''}`
              : `didn’t finish · ${s.correct}/${s.total} correct`}
          </span>
        </li>
      ))}
    </ol>
  );
}
