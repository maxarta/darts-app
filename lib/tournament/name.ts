const MONTHS_NOMINATIVE_RU = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
] as const;

function capitalizeMonth(month: string): string {
  return month.charAt(0).toUpperCase() + month.slice(1);
}

/** «Турнир • Май 2026» */
export function generateTournamentName(date = new Date()): string {
  const month = capitalizeMonth(MONTHS_NOMINATIVE_RU[date.getMonth()]);
  const year = date.getFullYear();
  return `Турнир • ${month} ${year}`;
}
