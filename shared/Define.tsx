// Look up a word's meanings and synonyms, from Datamuse (free, no key; only the word looked up is sent).
import { useState } from 'preact/hooks';

const API = 'https://api.datamuse.com/words';
const PARTS: Record<string, string> = { n: 'noun', v: 'verb', adj: 'adjective', adv: 'adverb' };

interface Found {
  word: string;
  /** Part of speech and meaning. */
  meanings: { part: string; text: string }[];
  synonyms: string[];
}

/** Datamuse gives each meaning as "n\tA long piece of timber". */
export function parseMeanings(defs: string[] = []) {
  return defs.map(d => {
    const [part, ...rest] = d.split('\t');
    return { part: PARTS[part] ?? '', text: rest.join(' ').trim() };
  });
}

async function lookUp(word: string): Promise<Found> {
  const q = encodeURIComponent(word);
  const [defs, syns] = await Promise.all(
    [`${API}?sp=${q}&md=d&max=1`, `${API}?rel_syn=${q}&max=30`].map(url => fetch(url).then(r => r.json())),
  );
  const exact = (defs as { word: string; defs?: string[] }[]).find(d => d.word.toLowerCase() === word.toLowerCase());
  return { word, meanings: parseMeanings(exact?.defs), synonyms: (syns as { word: string }[]).map(s => s.word) };
}

export function Define({ initial = '', onClose }: { initial?: string; onClose(): void }) {
  const [word, setWord] = useState(initial);
  const [found, setFound] = useState<Found | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function submit(text: string) {
    const w = text.trim();
    if (!w) return;
    setProblem('Looking it up…');
    try {
      setFound(await lookUp(w));
      setProblem(null);
    } catch {
      setProblem('Couldn’t reach the dictionary.');
    }
  }

  return (
    <div class="define">
      <div class="define-form">
        <input
          class="define-input"
          autoFocus
          placeholder="A word or phrase"
          value={word}
          onInput={e => setWord(e.currentTarget.value)}
          // The input's own value: Enter can come before the last letter typed has been rendered.
          onKeyDown={e => e.key === 'Enter' && submit(e.currentTarget.value)}
        />
        <button onClick={() => submit(word)}>Define</button>
        <button class="secondary" onClick={onClose} title="Close">
          ×
        </button>
      </div>
      {problem && <p class="hint">{problem}</p>}
      {found && !problem && (
        <div class="define-results">
          {found.meanings.length ? (
            <ol>
              {found.meanings.map(m => (
                <li>
                  {m.part && <i>{m.part} </i>}
                  {m.text}
                </li>
              ))}
            </ol>
          ) : (
            <p class="hint">No meanings found for “{found.word}”.</p>
          )}
          {found.synonyms.length > 0 && (
            <p class="synonyms">
              <b>Synonyms:</b> {found.synonyms.join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
