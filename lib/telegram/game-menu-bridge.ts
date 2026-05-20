/** Обработчик меню игры для нативной кнопки «Назад» в шапке Telegram. */
let openHandler: (() => void) | null = null;

export function setGameMenuHandler(handler: (() => void) | null): void {
  openHandler = handler;
}

export function openGameMenuFromTelegramBack(): void {
  openHandler?.();
}
