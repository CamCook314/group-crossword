// A note from the extension on the crossword's own page, e.g. that it's being played in Group Crossword.
// Mouse events pass straight through to the site.
const STYLE = `
  :host { all: initial; }
  .note { position: fixed; left: 50%; bottom: 16px; transform: translateX(-50%); z-index: 2147483647; pointer-events: none;
          max-width: min(560px, calc(100vw - 32px)); padding: 8px 14px; border-radius: 6px; background: #1f1f24; color: #ececf1;
          font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35); }
  .note[hidden] { display: none; }
`;

export class Notice {
  private note: HTMLDivElement;

  constructor() {
    const host = document.createElement('div');
    host.id = 'group-crossword-notice';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    this.note = document.createElement('div');
    this.note.className = 'note';
    this.note.hidden = true;
    root.append(style, this.note);
    document.documentElement.append(host);
  }

  show(text: string | null) {
    this.note.textContent = text ?? '';
    this.note.hidden = !text;
  }
}
