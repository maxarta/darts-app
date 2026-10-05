import { useParams } from "react-router-dom";
import { GameScreen } from "@/components/game/GameScreen";

export function GamePage() {
  const { id } = useParams();
  if (!id) return null;
  return <GameScreen key={id} gameId={id} />;
}
