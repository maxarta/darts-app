const ruPluralRules = new Intl.PluralRules("ru");

type RuPluralForms = {
  one: string;
  few: string;
  many: string;
};

function ruWord(n: number, forms: RuPluralForms): string {
  switch (ruPluralRules.select(n)) {
    case "one":
      return forms.one;
    case "few":
      return forms.few;
    default:
      return forms.many;
  }
}

/** e.g. `2 игры`, `1 игра`, `5 игр` */
export function ruCount(n: number, forms: RuPluralForms): string {
  return `${n} ${ruWord(n, forms)}`;
}

const RU_GAMES = { one: "игра", few: "игры", many: "игр" } as const;
const RU_WINS = { one: "победа", few: "победы", many: "побед" } as const;
const RU_LEGS = { one: "лег", few: "лега", many: "легов" } as const;
const RU_THROWS = { one: "бросок", few: "броска", many: "бросков" } as const;
const RU_DARTS = { one: "дротик", few: "дротика", many: "дротиков" } as const;

export function ruGamesCount(n: number): string {
  return ruCount(n, RU_GAMES);
}

export function ruWinsCount(n: number): string {
  return ruCount(n, RU_WINS);
}

export function ruLegsCount(n: number): string {
  return ruCount(n, RU_LEGS);
}

export function ruThrowsCount(n: number): string {
  return ruCount(n, RU_THROWS);
}

export function ruDartsCount(n: number): string {
  return ruCount(n, RU_DARTS);
}

/** e.g. `дротик` / `дротика` / `дротиков` (without the number). */
export function ruDartsWord(n: number): string {
  return ruWord(n, RU_DARTS);
}

/** Leaderboard row meta: games · wins · legs */
export function formatStatsLeaderboardMeta(
  gamesPlayed: number,
  wins: number,
  legsWon: number
): string {
  return `${ruGamesCount(gamesPlayed)} · ${ruWinsCount(wins)} · ${ruLegsCount(legsWon)}`;
}

/** Player profile summary: games · PPR · wins */
export function formatStatsPlayerSummary(
  gamesPlayed: number,
  avgPpr: number,
  wins: number
): string {
  return `${ruGamesCount(gamesPlayed)} · PPR ${avgPpr} · ${ruWinsCount(wins)}`;
}
