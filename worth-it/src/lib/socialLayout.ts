export function socialLayout(width: number, height: number) {
  const viewport = Math.max(0, width);
  const desktop = viewport >= 880;
  const shellWidth = Math.min(viewport, 960);
  const feedWidth = Math.max(0, Math.min(600, shellWidth - (desktop ? 208 + 48 : 16)));
  const gridWidth = Math.min(viewport, 900);
  return {
    desktop,
    feedWidth,
    gridWidth,
    tileWidth: Math.max(0, (gridWidth - 4) / 3),
    reelHeight: Math.min((feedWidth * 16) / 9, Math.max(180, height - 240), 720),
  };
}
