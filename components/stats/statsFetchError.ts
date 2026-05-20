export function statsFetchMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Ошибка загрузки";
}
