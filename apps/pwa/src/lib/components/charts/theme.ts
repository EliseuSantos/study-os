// Shared Chart.js theming: colors come from the design tokens at render time,
// so charts follow the light/dark toggle like everything else.
export interface ChartTheme {
  accent: string;
  accentDim: string;
  success: string;
  hairline: string;
  border: string;
  textLow: string;
  textBody: string;
  bgDeep: string;
  font: string;
}

export function chartTheme(): ChartTheme {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    accent: v('--accent'),
    accentDim: v('--accent-dim'),
    success: v('--success'),
    hairline: v('--hairline'),
    border: v('--border'),
    textLow: v('--text-low'),
    textBody: v('--text-body'),
    bgDeep: v('--bg-deep'),
    font: v('--font-display') || 'sans-serif',
  };
}

/** Re-runs `apply` whenever the theme toggle flips data-theme on <html>. */
export function onThemeChange(apply: () => void): () => void {
  const observer = new MutationObserver(apply);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => observer.disconnect();
}

/** '#rrggbb' → 'rgba(r,g,b,a)' — canvas fillStyle can't resolve color-mix(). */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (m === null) return hex;
  const n = parseInt(m[1] ?? '0', 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
