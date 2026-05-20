import {
  optimisticEndVisit,
  optimisticThrow,
  type GameSnapshot,
} from "@/lib/game/optimistic";
import type { GameEvent } from "./types";

export function replayEvents(
  initial: GameSnapshot,
  events: GameEvent[]
): GameSnapshot {
  let snapshot = initial;
  for (const event of events) {
    if (event.type === "throw") {
      const next = optimisticThrow(snapshot, event.input);
      if (!next) break;
      snapshot = next;
    } else {
      const next = optimisticEndVisit(snapshot);
      if (!next) break;
      snapshot = next;
    }
  }
  return snapshot;
}
