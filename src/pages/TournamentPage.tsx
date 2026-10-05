import { Suspense } from "react";
import { useParams } from "react-router-dom";
import { TournamentScreen } from "@/components/tournament/TournamentScreen";

function TournamentPageContent() {
  const { id } = useParams();
  if (!id) return null;
  return <TournamentScreen tournamentId={id} />;
}

export function TournamentPage() {
  return (
    <Suspense>
      <TournamentPageContent />
    </Suspense>
  );
}
