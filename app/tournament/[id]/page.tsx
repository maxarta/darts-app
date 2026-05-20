"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import { TournamentScreen } from "@/components/tournament/TournamentScreen";

function TournamentPageContent() {
  const params = useParams();
  const tournamentId = params.id as string;
  return <TournamentScreen tournamentId={tournamentId} />;
}

export default function TournamentPage() {
  return (
    <Suspense>
      <TournamentPageContent />
    </Suspense>
  );
}
