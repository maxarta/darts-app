/** DB enum `game_status` is only `active` | `finished` | `cancelled`. `completed` is a legacy client alias. */
export const FINISHED_GAME_STATUSES = ["finished", "completed"] as const;

export function isFinishedGameStatus(status: string) {
  return (FINISHED_GAME_STATUSES as readonly string[]).includes(status);
}
