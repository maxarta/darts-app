import { describe, expect, it, vi, beforeEach } from "vitest";
import { showTelegramGameMenu } from "@/lib/telegram/game-menu-popup";

const showPopup = vi.fn();

vi.mock("@twa-dev/sdk", () => ({
  default: {
    initData: "test",
    showPopup,
  },
}));

describe("showTelegramGameMenu", () => {
  beforeEach(() => {
    showPopup.mockClear();
  });

  it("shows standard three-button popup", async () => {
    await showTelegramGameMenu({});
    expect(showPopup).toHaveBeenCalledWith(
      {
        message: " ",
        buttons: [
          { id: "restart", type: "default", text: "Заново" },
          { id: "leave", type: "destructive", text: "Покинуть" },
          { type: "cancel" },
        ],
      },
      expect.any(Function)
    );
  });

  it("calls onRestart when restart is chosen", async () => {
    const onRestart = vi.fn();
    showPopup.mockImplementation((_params, cb) => cb("restart"));
    await showTelegramGameMenu({ onRestart });
    expect(onRestart).toHaveBeenCalledOnce();
  });
});
