export type Standing = {
  userId: number;
  points: number;
  legsDiff: number;
  name: string;
};

export function generateRoundRobinPairings(
  participantIds: number[]
): [number, number][] {
  const ids = [...participantIds];
  if (ids.length % 2 === 1) {
    ids.push(-1); // bye
  }
  const n = ids.length;
  const rounds = n - 1;
  const pairings: [number, number][] = [];
  const fixed = ids[0];
  let rotating = ids.slice(1);

  for (let r = 0; r < rounds; r++) {
    const round: number[] = [fixed, ...rotating];
    for (let i = 0; i < n / 2; i++) {
      const a = round[i];
      const b = round[n - 1 - i];
      if (a !== -1 && b !== -1) {
        pairings.push([a, b]);
      }
    }
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return pairings;
}

/** Fisher–Yates shuffle (e.g. reveal order for жеребьёвка). */
export function shuffleInPlace<T>(items: T[], random = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function sortStandings(standings: Standing[]): Standing[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return b.legsDiff - a.legsDiff;
  });
}

export type PlayoffMatchSeed = {
  round: number;
  slot: number;
  player1Id: number | null;
  player2Id: number | null;
};

export function generatePlayoffBracket(
  qualifiedIds: number[],
  size: 4 | 8
): PlayoffMatchSeed[] {
  const seeds = sortStandings(
    qualifiedIds.map((id, i) => ({
      userId: id,
      points: qualifiedIds.length - i,
      legsDiff: 0,
      name: "",
    }))
  ).map((s) => s.userId);

  const bracketSize = size;
  const padded: (number | null)[] = [...seeds];
  while (padded.length < bracketSize) padded.push(null);

  const matches: PlayoffMatchSeed[] = [];
  const round1Pairs: [number | null, number | null][] = [];
  for (let i = 0; i < bracketSize / 2; i++) {
    round1Pairs.push([padded[i], padded[bracketSize - 1 - i]]);
  }

  round1Pairs.forEach(([p1, p2], slot) => {
    matches.push({ round: 1, slot, player1Id: p1, player2Id: p2 });
  });

  let prevRoundCount = bracketSize / 2;
  let round = 2;
  while (prevRoundCount > 1) {
    for (let slot = 0; slot < prevRoundCount / 2; slot++) {
      matches.push({
        round,
        slot,
        player1Id: null,
        player2Id: null,
      });
    }
    prevRoundCount /= 2;
    round++;
  }

  return matches;
}
