// An anagram wheel: type the letters to rearrange, click them from the circle into the answer's squares (click an
// empty square first to choose where the next one goes), then put the result in the grid. The parent decides where
// the panel sits. Styles are in anagram.css.
import { useEffect, useRef, useState } from 'preact/hooks';
import { circlePositions, keepPlaced, lettersOf, shuffle, withoutKnown } from './anagram';

export function AnagramPad({
  slots,
  breaks,
  onUse,
  onClose,
}: {
  /** The answer's squares in order: known letters, '' where empty. */
  slots: string[];
  /** What comes after each square, from the clue's enumeration: a word gap, a hyphen or nothing. */
  breaks?: ('' | 'word' | 'hyphen')[];
  /** Fills the answer: one letter per square, '' where nothing was placed. */
  onUse(letters: string[]): void;
  onClose(): void;
}) {
  const [text, setText] = useState('');
  /** Letters still on the wheel, in the order shown. */
  const [pool, setPool] = useState<string[]>([]);
  /** Letters put into the answer: one per square, '' where none. */
  const [placed, setPlaced] = useState(() => slots.map(() => ''));
  /** The square picked for the next letter; -1 for none. */
  const [chosen, setChosen] = useState(-1);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  // The next letter goes in the chosen square while it's empty, else in the first empty one.
  const target =
    chosen >= 0 && !slots[chosen] && !placed[chosen] ? chosen : slots.findIndex((known, i) => !known && !placed[i]);
  const anyPlaced = placed.some(Boolean);
  const positions = circlePositions(pool.length);

  // Buttons hand focus back to the text box: the grid ignores keys typed there, so stray keys don't type into it.
  const act = (fn: () => void) => () => {
    fn();
    input.current?.focus();
  };

  function edit(value: string) {
    const kept = keepPlaced(withoutKnown(lettersOf(value), slots), placed);
    setText(value);
    setPool(kept.pool);
    setPlaced(kept.placed);
  }

  function place(i: number) {
    const next = placed.map((letter, s) => (s === target ? pool[i] : letter));
    setPlaced(next);
    setPool(pool.filter((_, j) => j !== i));
    // Then on to the next empty square after it; with none, back to the first.
    setChosen(slots.findIndex((known, s) => s > target && !known && !next[s]));
  }

  function unplace(s: number) {
    setPool([...pool, placed[s]]);
    setPlaced(placed.map((letter, j) => (j === s ? '' : letter)));
  }

  function clear() {
    setPool([...pool, ...placed.filter(Boolean)]);
    setPlaced(placed.map(() => ''));
    setChosen(-1);
  }

  return (
    <div
      class="anagram"
      onKeyDown={e => {
        if (e.key !== 'Escape') return;
        // Keep it from the grid's own Escape handling too.
        e.stopPropagation();
        onClose();
      }}
    >
      <div class="anagram-head">
        <input
          ref={input}
          class="anagram-input"
          aria-label="Letters to rearrange"
          placeholder="Letters to rearrange"
          spellcheck={false}
          autocomplete="off"
          value={text}
          onInput={e => {
            // Letters only. Their case is kept so the caret doesn't jump; the CSS shows them uppercase.
            const value = e.currentTarget.value.replace(/[^a-z]/gi, '');
            if (value !== e.currentTarget.value) e.currentTarget.value = value;
            edit(value);
          }}
        />
        <button type="button" class="anagram-close" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          ×
        </button>
      </div>

      <div class="anagram-wheel">
        {pool.map((letter, i) => (
          <button
            type="button"
            class="anagram-letter"
            style={{ left: `${positions[i].x}%`, top: `${positions[i].y}%` }}
            disabled={target < 0}
            onClick={act(() => place(i))}
          >
            {letter}
          </button>
        ))}
      </div>

      <div class="anagram-slots">
        {slots.map((known, s) => (
          <>
            {placed[s] ? (
              <button type="button" class="anagram-slot placed" title="Put back" onClick={act(() => unplace(s))}>
                {placed[s]}
              </button>
            ) : known ? (
              <span class="anagram-slot known">{known}</span>
            ) : (
              <button
                type="button"
                class={s === target ? 'anagram-slot target' : 'anagram-slot'}
                title="Put the next letter here"
                onClick={act(() => setChosen(s))}
              />
            )}
            {breaks?.[s] === 'word' && <span class="anagram-gap" />}
            {breaks?.[s] === 'hyphen' && <span class="anagram-hyphen" />}
          </>
        ))}
      </div>

      <div class="anagram-actions">
        <button type="button" class="anagram-secondary" disabled={pool.length < 2} onClick={act(() => setPool(shuffle(pool)))}>
          Shuffle
        </button>
        <button type="button" class="anagram-secondary" disabled={!anyPlaced} onClick={act(clear)}>
          Clear
        </button>
        <button type="button" disabled={!anyPlaced} onClick={act(() => onUse(placed))}>
          Use
        </button>
      </div>
    </div>
  );
}
