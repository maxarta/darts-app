import { describe, it, expect } from "vitest";
import {
  allocateLocalPlayerId,
  remapMemberIdInList,
  removeMemberFromList,
  upsertMemberInList,
} from "@/lib/offline/members-store";
import type { ChannelMember } from "@/lib/channel/members";
import {
  buildOfflineWebSession,
  isProbablyOfflineError,
} from "@/lib/offline/session-cache";

function member(id: number, name: string): ChannelMember {
  return {
    user_id: id,
    users: { first_name: name, username: null, photo_url: null },
  };
}

describe("offline members helpers", () => {
  it("allocates negative local player ids", () => {
    const id = allocateLocalPlayerId();
    expect(id).toBeLessThan(0);
  });

  it("upserts, remaps and removes members", () => {
    let list = [member(1, "A")];
    list = upsertMemberInList(list, member(2, "B"));
    expect(list.map((m) => m.user_id)).toEqual([2, 1]);

    list = upsertMemberInList(list, member(2, "Bob"));
    expect(list.find((m) => m.user_id === 2)?.users).toMatchObject({
      first_name: "Bob",
    });

    list = remapMemberIdInList(list, 2, 99);
    expect(list.map((m) => m.user_id)).toEqual([99, 1]);

    list = removeMemberFromList(list, 99);
    expect(list.map((m) => m.user_id)).toEqual([1]);
  });
});

describe("offline session cache", () => {
  it("builds a usable offline web session", () => {
    const session = buildOfflineWebSession();
    expect(session.user.first_name).toBeTruthy();
    expect(session.channel?.id).toBeTruthy();
    expect(session.isChannelAdmin).toBe(true);
  });

  it("detects offline-looking errors", () => {
    expect(isProbablyOfflineError(new Error("Failed to fetch"))).toBe(true);
    expect(isProbablyOfflineError(new Error("validation"))).toBe(false);
  });
});
