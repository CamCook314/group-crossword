import type { Player } from '../../shared/protocol';

/** Everyone online, with their colours. */
export function PlayerList({ players, me }: { players: Player[]; me?: string }) {
  return (
    <ul class="players">
      {players
        .filter(p => p.online)
        .map(p => (
          <li>
            <span class="dot" style={{ background: p.color }} />
            {p.name}
            {p.host && ' (host)'}
            {p.id === me && ' (you)'}
          </li>
        ))}
    </ul>
  );
}
