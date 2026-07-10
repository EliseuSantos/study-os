export type HeatLevel = 0 | 1 | 2 | 3 | 4;

export interface ProgressImageData {
  streak: number;
  totalHours: number;
  /** 84 cells, column-major (12 week columns × 7 day rows), like the stats heatmap. */
  heat: { level: HeatLevel }[];
}

const SIZE = 1080;
const CELL = 24;
const GAP = 6;
const COLS = 12;
const ROWS = 7;

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

/**
 * Renders a 1080×1080 share card (brand mark, streak, net hours, mini heatmap)
 * using the current theme tokens and triggers a `progresso.png` download.
 */
export async function downloadProgressImage(data: ProgressImageData): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx === null) return;

  const bg = cssVar('--bg', '#191712');
  const accent = cssVar('--accent', '#E9A94F');
  const textHi = cssVar('--text-hi', '#F1ECE3');
  const textLow = cssVar('--text-low', '#7B756A');
  const hairline = cssVar('--hairline', '#2B2721');
  const heatColors: Record<Exclude<HeatLevel, 0>, string> = {
    1: cssVar('--heat-1', 'rgba(233, 169, 79, .22)'),
    2: cssVar('--heat-2', 'rgba(233, 169, 79, .42)'),
    3: cssVar('--heat-3', 'rgba(233, 169, 79, .66)'),
    4: cssVar('--heat-4', '#E9A94F'),
  };

  // Background.
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, SIZE, SIZE);

  // Brand mark + wordmark.
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.roundRect(64, 64, 28, 28, 8);
  ctx.fill();
  ctx.fillStyle = textHi;
  ctx.font = '600 40px "Space Grotesk"';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('StudyOS', 108, 80);

  // Streak, huge and centered.
  ctx.textAlign = 'center';
  ctx.fillStyle = textHi;
  ctx.font = '700 220px "Space Grotesk"';
  ctx.fillText(String(data.streak), SIZE / 2, 430);
  ctx.fillStyle = textLow;
  ctx.font = '400 32px "Space Grotesk"';
  ctx.fillText('dias de constância', SIZE / 2, 580);
  ctx.fillText(`${data.totalHours}h líquidas · últimas 12 semanas`, SIZE / 2, 636);

  // Mini heatmap, column-major like the stats grid.
  const gridW = COLS * CELL + (COLS - 1) * GAP;
  const gridH = ROWS * CELL + (ROWS - 1) * GAP;
  const gridX = (SIZE - gridW) / 2;
  const gridY = 760;
  for (let i = 0; i < COLS * ROWS; i++) {
    const level = data.heat[i]?.level ?? 0;
    const x = gridX + Math.floor(i / ROWS) * (CELL + GAP);
    const y = gridY + (i % ROWS) * (CELL + GAP);
    ctx.beginPath();
    ctx.roundRect(x, y, CELL, CELL, 5);
    if (level === 0) {
      ctx.strokeStyle = hairline;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = heatColors[level];
      ctx.fill();
    }
  }

  // Footer.
  ctx.fillStyle = textLow;
  ctx.font = '400 24px "Space Grotesk"';
  ctx.fillText('estudo local-first · studyos', SIZE / 2, gridY + gridH + 76);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });
  if (blob === null) return;

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'progresso.png';
  anchor.click();
  URL.revokeObjectURL(url);
}
