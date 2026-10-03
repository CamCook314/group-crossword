// Private notes for a puzzle, kept in this browser.
import { useState } from 'preact/hooks';

export function Scratchpad({ storageKey }: { storageKey: string }) {
  const [text, setText] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? '';
    } catch {
      return '';
    }
  });
  return (
    <textarea
      class="scratchpad"
      placeholder="Notes: only you can see these."
      value={text}
      onInput={e => {
        const value = e.currentTarget.value;
        setText(value);
        try {
          localStorage.setItem(storageKey, value);
        } catch {}
      }}
    />
  );
}
