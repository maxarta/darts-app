export type GameMenuCallbacks = {
  onRestart?: () => void;
  onLeave?: () => void;
};

/** Нативный `WebApp.showPopup`: Заново · Покинуть · Отмена. */
export async function showTelegramGameMenu(
  callbacks: GameMenuCallbacks
): Promise<void> {
  const { default: WebApp } = await import("@twa-dev/sdk");
  if (!WebApp.initData) return;

  try {
    WebApp.showPopup(
      {
        message: " ",
        buttons: [
          { id: "restart", type: "default", text: "Заново" },
          { id: "leave", type: "destructive", text: "Покинуть" },
          { type: "cancel" },
        ],
      },
      (buttonId) => {
        if (buttonId === "restart") callbacks.onRestart?.();
        else if (buttonId === "leave") callbacks.onLeave?.();
      }
    );
  } catch {
    const restart = window.confirm("Начать игру заново?");
    if (restart) {
      callbacks.onRestart?.();
      return;
    }
    const leave = window.confirm("Покинуть?");
    if (leave) callbacks.onLeave?.();
  }
}
