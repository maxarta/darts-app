import { Suspense } from "react";
import { NewGameScreen } from "@/components/game-new/NewGameScreen";

export function NewGamePage() {
  return (
    <Suspense>
      <NewGameScreen />
    </Suspense>
  );
}
