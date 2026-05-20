"use client";

import { Suspense } from "react";
import { NewTournamentScreen } from "@/components/tournament-new/NewTournamentScreen";

export default function NewTournamentPage() {
  return (
    <Suspense>
      <NewTournamentScreen />
    </Suspense>
  );
}
