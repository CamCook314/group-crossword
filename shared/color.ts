/** Hue 0–360, saturation and value 0–1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return '#' + [channel(5), channel(3), channel(1)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

export function hexToHsv(hex: string): Hsv {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const v = Math.max(r, g, b);
  const d = v - Math.min(r, g, b);
  const h = d === 0 ? 0 : v === r ? ((g - b) / d + 6) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: v === 0 ? 0 : d / v, v };
}

/** Black or white, whichever reads better on top of the colour. */
export function textOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? '#000000' : '#ffffff';
}
