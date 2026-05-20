import type { ThrowInput } from "./rules";
import { isHuzpaClassicVisit } from "@/lib/game/achievements/visit-detectors";

/** @deprecated Используйте isHuzpaClassicVisit */
export function isHutspaVisit(throws: ThrowInput[]): boolean {
  return isHuzpaClassicVisit(throws);
}
