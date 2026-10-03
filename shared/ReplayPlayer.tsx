// Watching a race or co-op solve back: every board filling in over time, with play/pause, speed and a scrubber.
// Styles are in replay.css; the boards themselves use grid.css.
import { useEffect, useState } from 'preact/hooks';
import { Grid } from './Crossword';
import type { Puzzle } from './puzzle';
import { formatTime } from './race';
import { boardAt, contributorsAt, type ReplayEvent } from './replay';

/** Playback speeds. At the default 30×, a 10-minute solve takes 20 seconds. */
const SPEEDS = [10, 30, 60, 120];

interface Props {
  puzzle: Puzzle;
  events: ReplayEvent[];
  /** Length of the race or solve. */
  durationMs: number;
  /** finishedAt: ms since the start, if they finished. */
  boards: { id: string; label: string; color: string; finishedAt?: number | null }[];
  /** Marks wrong letters when given. */
  solution?: string[];
  /** Colours letters by who put them there when given (co-op). */
  colorOf?: (by: string) => string | undefined;
}

export function ReplayPlayer({ puzzle, events, durationMs, boards, solution, colorOf }: Props) {
  const [t, setT] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);

  // Move the playhead every frame while playing.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      setT(t => Math.min(durationMs, t + Math.max(0, now - last) * speed));
      last = now;
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, speed, durationMs]);

  useEffect(() => {
    if (playing && t >= durationMs) setPlaying(false);
  }, [playing, t, durationMs]);

  function playPause() {
    if (!playing && t >= durationMs) setT(0);
    setPlaying(!playing);
  }

  const cells = puzzle.blocks.length;
  return (
    <div class="replay">
      <div class="replay-controls">
        <button class="replay-play" onClick={playPause}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <input class="replay-scrubber" type="range" min={0} max={durationMs} value={t} aria-label="Time" onInput={e => setT(Number(e.currentTarget.value))} />
        <span class="replay-time">
          {formatTime(t)} / {formatTime(durationMs)}
        </span>
        <select class="replay-speed" aria-label="Speed" value={speed} onChange={e => setSpeed(Number(e.currentTarget.value))}>
          {SPEEDS.map(s => (
            <option value={s}>{s}×</option>
          ))}
        </select>
      </div>
      <div class="replay-boards">
        {boards.map(b => {
          const letters = boardAt(events, b.id, cells, t);
          const by = colorOf ? contributorsAt(events, b.id, cells, t) : [];
          return (
            <figure>
              <div class="board">
                <Grid
                  puzzle={puzzle}
                  cellClass={cell => (solution && letters[cell] && letters[cell] !== solution[cell] ? 'wrong' : '')}
                  renderCell={cell => (
                    <span class="letter" style={{ color: colorOf?.(by[cell]) }}>
                      {letters[cell]}
                    </span>
                  )}
                />
              </div>
              <figcaption class="replay-caption">
                <span class="dot" style={{ background: b.color }} />
                <span class="replay-label">{b.label}</span>
                {b.finishedAt != null && t >= b.finishedAt && <span class="replay-finished">Finished {formatTime(b.finishedAt)}</span>}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
