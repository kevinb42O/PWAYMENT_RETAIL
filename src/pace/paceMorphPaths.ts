export type PaceGlyph = "pace" | "question" | "exclamation" | "liquid";

// Every body uses the exact same SVG command topology (M + 15 cubic curves + Z).
// Motion can therefore interpolate the actual silhouette instead of cross-fading
// unrelated assets or disguising a swap with scale/opacity.
export const PACE_MORPH_BODY: Record<PaceGlyph, string> = {
  pace: "M8 26 C8 20 12 16 18 16 C39 16 60 16 74 16 C88 16 96 27 96 42 C96 58 87 68 73 68 C58 68 43 68 31 68 C24 68 19 73 19 81 C19 88 16 92 10 92 C4 92 2 88 2 82 C2 70 5 61 12 55 C18 50 24 48 32 48 C47 48 61 48 70 48 C76 48 79 45 79 40 C79 36 76 33 70 33 C53 33 36 33 18 33 C12 33 8 31 8 26 Z",
  question: "M24 28 C26 22 30 17 36 14 C42 11 49 10 56 11 C70 12 79 21 81 33 C83 44 78 52 70 58 C66 61 61 64 58 67 C56 69 55 72 55 74 C55 78 52 81 47 81 C42 81 38 78 38 73 C38 67 41 62 47 57 C51 53 57 50 61 46 C64 43 66 40 65 36 C65 30 60 27 53 27 C46 27 42 30 39 36 C36 43 31 45 26 42 C21 39 20 34 24 28 Z",
  exclamation: "M50 10 C52 10 54 10 56 11 C59 12 60 14 61 17 C62 20 61 24 61 28 C60 33 60 38 60 43 C59 48 59 53 58 58 C58 64 57 69 56 73 C55 77 53 79 50 79 C47 79 45 77 44 73 C43 69 42 64 42 58 C41 53 41 48 40 43 C40 38 40 33 39 28 C39 24 38 20 39 17 C40 14 41 12 43 11 C45 10 47 10 48 10 C49 10 50 10 50 10 Z",
  liquid: "M18 27 C21 22 25 18 30 15 C35 12 41 10 47 10 C53 10 59 12 64 14 C70 17 76 21 80 26 C84 31 87 37 88 43 C89 49 88 55 86 61 C84 67 81 72 76 77 C71 82 65 85 59 87 C52 89 45 90 38 88 C31 87 25 84 20 80 C15 76 11 71 9 65 C7 59 7 53 9 47 C10 41 12 36 14 32 C15 30 16 28 18 27 C17 27 17 27 18 27 Z",
};

// The punctuation dot is also geometry. During a liquid morph it becomes a
// detached droplet; in the Pace mark it collapses invisibly into the ribbon.
export const PACE_MORPH_DOT: Record<PaceGlyph, string> = {
  pace: "M50 54 C50 54 50 54 50 54 C50 54 50 54 50 54 C50 54 50 54 50 54 C50 54 50 54 50 54 Z",
  question: "M40 93 C40 88.5 42.8 85.5 47 85.5 C51.2 85.5 54 88.5 54 93 C54 97.5 51.2 100 47 100 C42.8 100 40 97.5 40 93 Z",
  exclamation: "M42 91 C42 85 45 82 50 82 C55 82 58 85 58 91 C58 96 55 99 50 99 C45 99 42 96 42 91 Z",
  liquid: "M84 77 C84 72 87 69 91 70 C96 71 98 75 96 80 C94 85 90 87 87 84 C84 82 83 79 84 77 Z",
};
