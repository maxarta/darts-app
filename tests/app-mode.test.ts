import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.stubGlobal("localStorage", {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => {
    store.clear();
  },
  key: () => null,
  get length() {
    return store.size;
  },
});

vi.stubGlobal("crypto", {
  randomUUID: () => "test-uuid-0001",
});

const {
  getAppMode,
  getGuestChannelId,
  lockToGuest,
  readLastRoster,
  setAppMode,
  tryUnlockExtended,
  writeLastRoster,
} = await import("../lib/app-mode");

describe("app-mode", () => {
  beforeEach(() => {
    store.clear();
  });

  it("defaults to guest", () => {
    expect(getAppMode()).toBe("guest");
  });

  it("unlocks extended with the configured code", () => {
    expect(tryUnlockExtended("wrong")).toBe(false);
    expect(getAppMode()).toBe("guest");
    expect(tryUnlockExtended("polyana")).toBe(true);
    expect(getAppMode()).toBe("extended");
  });

  it("can switch back to guest", () => {
    setAppMode("extended");
    lockToGuest();
    expect(getAppMode()).toBe("guest");
  });

  it("keeps a stable guest channel id", () => {
    const a = getGuestChannelId();
    const b = getGuestChannelId();
    expect(a).toBe(b);
    expect(a).toMatch(/^guest-/);
  });

  it("remembers last roster per channel", () => {
    writeLastRoster("ch-1", [1, 2, 2, 3]);
    writeLastRoster("ch-2", [9]);
    expect(readLastRoster("ch-1")).toEqual([1, 2, 3]);
    expect(readLastRoster("ch-2")).toEqual([9]);
  });
});
