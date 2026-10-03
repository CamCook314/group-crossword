// Preset colour swatches, plus a colour wheel for any other colour. Used by the guest page and the host's sidebar,
// which both style `.swatches` / `.swatch`; the wheel styles itself.
import { useState } from 'preact/hooks';
import { hexToHsv, hsvToHex, type Hsv } from './color';
import { COLORS } from './protocol';

const RAINBOW = 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)';
const WHEEL_SIZE = 160;

export function ColorPicker({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const custom = !COLORS.includes(value);
  return (
    <div>
      <div class="swatches">
        {COLORS.map(c => (
          <button
            type="button"
            key={c}
            class={c === value ? 'swatch picked' : 'swatch'}
            style={{ background: c }}
            title={c}
            onClick={() => {
              setOpen(false);
              onPick(c);
            }}
          />
        ))}
        <button
          type="button"
          class={custom ? 'swatch picked' : 'swatch'}
          style={{ background: custom ? value : RAINBOW }}
          title="Any colour"
          onClick={() => setOpen(o => !o)}
        />
      </div>
      {open && <Wheel value={value} onPick={onPick} />}
    </div>
  );
}

/** Hue around the wheel, saturation out from the centre, brightness on a slider. Picks are sent when you let go. */
function Wheel({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const [hsv, setHsv] = useState(() => hexToHsv(value));
  const [text, setText] = useState(value);

  const update = (next: Hsv, commit: boolean) => {
    setHsv(next);
    setText(hsvToHex(next));
    if (commit) onPick(hsvToHex(next));
  };

  const fromPointer = (e: PointerEvent, commit: boolean) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    update({ h: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360, s: Math.min(1, Math.hypot(dx, dy) / (r.width / 2)), v: hsv.v }, commit);
  };

  const angle = (hsv.h * Math.PI) / 180;
  return (
    <div style={{ display: 'grid', gap: '8px', marginTop: '10px', width: `${WHEEL_SIZE}px` }}>
      <div
        class="color-wheel"
        style={{
          width: `${WHEEL_SIZE}px`,
          height: `${WHEEL_SIZE}px`,
          borderRadius: '50%',
          position: 'relative',
          cursor: 'crosshair',
          touchAction: 'none',
          // conic-gradient starts at 12 o'clock; "from 90deg" puts red at 3 o'clock to match Math.atan2.
          background: 'radial-gradient(circle closest-side, #fff, transparent), conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)',
        }}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          fromPointer(e, false);
        }}
        onPointerMove={e => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e, false)}
        onPointerUp={e => fromPointer(e, true)}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: '#000', opacity: 1 - hsv.v, pointerEvents: 'none' }} />
        <div
          style={{
            position: 'absolute',
            left: `${50 + Math.cos(angle) * hsv.s * 50}%`,
            top: `${50 + Math.sin(angle) * hsv.s * 50}%`,
            width: '14px',
            height: '14px',
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px #000',
            background: hsvToHex(hsv),
            pointerEvents: 'none',
          }}
        />
      </div>
      <input
        type="range"
        aria-label="Brightness"
        style={{ width: '100%', minWidth: 0, margin: 0 }}
        min={0}
        max={100}
        value={Math.round(hsv.v * 100)}
        onInput={e => update({ ...hsv, v: Number(e.currentTarget.value) / 100 }, false)}
        onChange={e => update({ ...hsv, v: Number(e.currentTarget.value) / 100 }, true)}
      />
      <input
        class="hex"
        aria-label="Hex colour"
        maxLength={7}
        spellcheck={false}
        value={text}
        style={{ fontFamily: 'ui-monospace, Consolas, monospace', width: '100%', minWidth: 0, boxSizing: 'border-box' }}
        onInput={e => {
          const t = e.currentTarget.value.trim();
          setText(t);
          if (/^#[0-9a-f]{6}$/i.test(t)) {
            setHsv(hexToHsv(t));
            onPick(t.toLowerCase());
          }
        }}
      />
    </div>
  );
}
