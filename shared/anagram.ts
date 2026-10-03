// Pure helpers for the anagram pad (Anagram.tsx).

/** How far the letters sit from the wheel's centre, in percent of its width. anagram.css draws the ring to match. */
const RADIUS = 38;

/** The letters A-Z in some text, uppercased; everything else is dropped. */
export const lettersOf = (text: string): string[] => text.toUpperCase().match(/[A-Z]/g) ?? [];

/** A shuffled copy (Fisher-Yates). */
export function shuffle<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Percent positions for n items spaced evenly around a circle, clockwise from the top. */
export function circlePositions(n: number): { x: number; y: number }[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = (2 * Math.PI * i) / n;
    return { x: 50 + RADIUS * Math.sin(angle), y: 50 - RADIUS * Math.cos(angle) };
  });
}

/**
 * Takes the answer's known letters (any case, '' for an empty square) off the typed letters, one copy each, so the
 * whole fodder can be typed. Only letters typed beyond what the empty squares need come off, so typing just the
 * missing letters still works.
 */
export function withoutKnown(letters: string[], known: string[]): string[] {
  const out = [...letters];
  let extra = letters.length - known.filter(letter => !letter).length;
  for (const letter of known) {
    const i = letter ? out.indexOf(letter.toUpperCase()) : -1;
    if (extra <= 0 || i < 0) continue;
    out.splice(i, 1);
    extra--;
  }
  return out;
}

/**
 * For when the letters change: keeps each placed letter that is still among them (blanking the rest, first slot
 * first) and returns the letters left over, in their original order.
 */
export function keepPlaced(letters: string[], placed: string[]): { pool: string[]; placed: string[] } {
  const pool = [...letters];
  const kept = placed.map(letter => {
    const i = letter ? pool.indexOf(letter) : -1;
    if (i < 0) return '';
    pool.splice(i, 1);
    return letter;
  });
  return { pool, placed: kept };
}
