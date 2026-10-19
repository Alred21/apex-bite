import type { TurnNumber } from './types';

/** Curated connected Turns shared by Drills, Reference Lap search and records. */
export const CORNER_COMPLEXES = [
  { id: 'T1-T3', label: 'Complex T1–T3 (Opening Sequence)', turns: [1, 2, 3] },
  { id: 'T2-T3', label: 'Complex T2–T3 (Sweeper into Hairpin 1)', turns: [2, 3] },
  { id: 'T4-T5', label: 'Complex T4–T5 (North Double-Right)', turns: [4, 5] },
  { id: 'T6-T7-T8', label: 'Complex T6–T7–T8 (Esses into Far-Right Sweeper)', turns: [6, 7, 8] },
  { id: 'T9-T10-T11', label: 'Complex T9–T10–T11 (Final Hairpin & Carousel)', turns: [9, 10, 11] },
] as const satisfies ReadonlyArray<{ id: string; label: string; turns: readonly TurnNumber[] }>;

export type CornerComplexId = typeof CORNER_COMPLEXES[number]['id'];
