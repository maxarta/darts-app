/** Раскладка клавиатуры landscape (Figma 6758:2464): 12 колонок × 5 рядов. */
export type LandscapeKeyCell = {
  segment: number;
  multiplier: 1 | 2 | 3;
};

/** В каждой зоне (single / double / triple): по строкам −1, по столбцам −4. */
export const LANDSCAPE_KEYPAD_GRID: LandscapeKeyCell[][] = Array.from(
  { length: 5 },
  (_, row) =>
    Array.from({ length: 12 }, (_, col) => {
      const band = Math.floor(col / 4) as 0 | 1 | 2;
      const colInBand = col % 4;
      const segment = 20 - row * 4 - colInBand;
      const multiplier = (band + 1) as 1 | 2 | 3;
      return { segment, multiplier };
    })
);
