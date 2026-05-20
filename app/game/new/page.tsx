"use client";

import { Suspense } from "react";
import { NewGameScreen } from "@/components/game-new/NewGameScreen";

export default function NewGamePage() {
  return (
    <Suspense>
      <NewGameScreen />
    </Suspense>
  );
}
