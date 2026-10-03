// Decodes PuzzleMe's scrambled puzzle data (`rawc`): Base64 JSON with successive chunks reversed, the chunk lengths
// cycling through an unknown 7-number key (each 2–20). The key is found by a pruned search.
//
// Adapted from xword-dl (https://github.com/thisisparker/xword-dl), whose version is adapted from
// kotwords (https://github.com/jpd236/kotwords), Copyright Jeff Davidson, Apache License 2.0
// (https://www.apache.org/licenses/LICENSE-2.0). Changes: ported from Python to TypeScript.

const KEY_LENGTH = 7;
const MIN_DIGIT = 2;
const MAX_DIGIT = 20;
const SEARCH_MS = 1500;

/** Like Python's base64.b64decode: ignores non-Base64 characters, but the padding must work out. */
function base64Bytes(s: string): Uint8Array | null {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, '');
  if (clean.length % 4) return null;
  try {
    return Uint8Array.from(atob(clean), c => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const reverse = (s: string) => [...s].reverse().join('');

/** Could a key starting with these digits be right? Decodes the stretches it covers and checks they look like text. */
function isValidKeyPrefix(rawc: string, prefix: number[], spacing: number): boolean {
  let pos = 0;
  while (pos < rawc.length) {
    const start = pos;
    let chunk = '';
    for (let k = 0; k < prefix.length && pos < rawc.length; k++) {
      const len = Math.min(prefix[k], rawc.length - pos);
      chunk += reverse(rawc.slice(pos, pos + len));
      pos += len;
    }
    // Only whole 4-character Base64 groups can be decoded.
    const from = Math.ceil(start / 4) * 4 - start;
    const to = Math.floor(pos / 4) * 4 - start;
    if (from < chunk.length && to > from) {
      const bytes = base64Bytes(chunk.slice(from, to));
      if (!bytes) return false;
      for (const b of bytes) {
        if ((b < 32 && b !== 9 && b !== 10 && b !== 13) || b === 0xc0 || b === 0xc1 || b >= 0xf5) return false;
      }
    }
    pos += spacing; // skip the stretch covered by the digits we haven't guessed yet
  }
  return true;
}

/** Reverses successive chunks whose lengths cycle through the key. Doing it twice gives back the original. */
export function reverseChunks(s: string, key: number[]): string {
  const chars = [...s];
  for (let i = 0, n = 0; i < chars.length - 1; n++) {
    const len = Math.min(key[n % key.length], chars.length - i);
    for (let l = i, r = i + len - 1; l < r; l++, r--) [chars[l], chars[r]] = [chars[r], chars[l]];
    i += len;
  }
  return chars.join('');
}

/** Base64 to UTF-8 text, or '' if it isn't valid. */
function base64Text(s: string): string {
  const bytes = base64Bytes(s);
  if (!bytes) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return '';
  }
}

/** The puzzle object inside a `rawc` string, or null if it can't be decoded. */
export function decodeRawc(rawc: string): unknown {
  // Some players don't scramble it at all: plain Base64 of `{"`.
  if (rawc.startsWith('eyJ')) {
    try {
      return JSON.parse(base64Text(rawc));
    } catch {
      // fall through to the search
    }
  }
  // `{"` / `{\n` in Base64 start "ey" / "ew"; reversed inside the first chunk they read "ye" / "we",
  // which gives away the first key digit.
  const at = (s: string) => (rawc.includes(s) ? rawc.indexOf(s) : rawc.length);
  const first = Math.min(at('ye'), at('we')) + 2;
  const queue: number[][] = [first > MAX_DIGIT ? [] : [first]];
  // Real data decodes in well under 100 ms. Data that isn't (say the scheme has changed) could keep the search going
  // for minutes, freezing the page it runs in, so give up after a while.
  const deadline = Date.now() + SEARCH_MS;
  while (queue.length && Date.now() < deadline) {
    const prefix = queue.shift()!;
    if (prefix.length === KEY_LENGTH) {
      try {
        return JSON.parse(base64Text(reverseChunks(rawc, prefix)));
      } catch {
        continue;
      }
    }
    for (let d = MIN_DIGIT; d <= MAX_DIGIT; d++) {
      const next = [...prefix, d];
      const remaining = KEY_LENGTH - next.length;
      for (let spacing = MIN_DIGIT * remaining; spacing <= MAX_DIGIT * remaining; spacing++) {
        if (isValidKeyPrefix(rawc, next, spacing)) {
          queue.push(next);
          break;
        }
      }
    }
  }
  return null;
}
