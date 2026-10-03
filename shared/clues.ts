// What clue texts tell us beyond the clue itself: word lengths, answers split across entries, and cross-references.
import type { Dir } from './puzzle';

export type Break = 'word' | 'hyphen';

export interface Enumeration {
  lengths: number[];
  /** What comes after each word but the last. */
  breaks: Break[];
}

/** The word lengths at the end of a clue: "(3,6)", "(4-2)", "(2,3,4)", "(5)". */
export function parseEnumeration(text: string): Enumeration | null {
  const m = text.match(/\((\d+(?:\s*[,\-\s.']\s*\d+)*)\)\s*\.?\s*$/);
  if (!m) return null;
  const tokens = m[1].match(/\d+|[,\-\s.']+/g)!;
  const lengths = tokens.filter(t => /\d/.test(t)).map(Number);
  const breaks = tokens.filter(t => !/\d/.test(t)).map(t => (t.includes('-') ? 'hyphen' : 'word') as Break);
  return { lengths, breaks };
}

/** Puts back the space before the enumeration that a site's markup can drop: "Lick it(3)" -> "Lick it (3)". */
export const spaceBeforeEnumeration = (text: string) => text.replace(/(\S)(\(\d+(?:\s*[,\-\s.']\s*\d+)*\)\s*\.?\s*)$/, '$1 $2');

const toDir = (word?: string): Dir | undefined => (!word ? undefined : /^a/i.test(word) ? 'A' : 'D');

/** "See 13" or "See 13 Down": this entry is a later part of clue 13's answer. */
export function continuationOf(text: string): { num: number; dir?: Dir } | null {
  const m = text.trim().match(/^see\s+(\d+)\s*-?\s*(across|down|ac|dn|a|d)?\s*\.?$/i);
  return m ? { num: Number(m[1]), dir: toDir(m[2]) } : null;
}

/** Other clues a clue's text mentions, like "a 4-Down" or "17 Across". */
export function referencesIn(text: string): { num: number; dir: Dir }[] {
  return [...text.matchAll(/\b(\d+)\s*-?\s*(across|down)\b/gi)].map(m => ({ num: Number(m[1]), dir: toDir(m[2])! }));
}
