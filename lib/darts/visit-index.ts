/** Индекс визита, в котором игрок сейчас набирает очки (или ждёт «след. игрок») */
export function getActiveVisitIndex(
  dartsThrown: number,
  visitScore: number,
  awaitingVisitEnd = false
): number {
  if (dartsThrown === 0) return 0;
  if (dartsThrown % 3 === 0) {
    if (awaitingVisitEnd || visitScore > 0) {
      return dartsThrown / 3 - 1;
    }
    return dartsThrown / 3;
  }
  return Math.floor(dartsThrown / 3);
}
