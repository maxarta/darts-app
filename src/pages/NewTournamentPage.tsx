import { Suspense } from "react";
import { NewTournamentScreen } from "@/components/tournament-new/NewTournamentScreen";

export function NewTournamentPage() {
  return (
    <Suspense>
      <NewTournamentScreen />
    </Suspense>
  );
}
