import { Route, Routes } from "react-router-dom";
import { SyncOnOnline } from "@/components/game/SyncOnOnline";
import { TelegramProvider } from "@/components/TelegramProvider";
import { HomePage } from "@/src/pages/HomePage";
import { NewGamePage } from "@/src/pages/NewGamePage";
import { GamePage } from "@/src/pages/GamePage";
import { NewTournamentPage } from "@/src/pages/NewTournamentPage";
import { TournamentPage } from "@/src/pages/TournamentPage";
import { StatsPage } from "@/src/pages/StatsPage";
import { StatsPlayersPage } from "@/src/pages/StatsPlayersPage";
import { StatsPlayerPage } from "@/src/pages/StatsPlayerPage";
import { StatsCurrentPage } from "@/src/pages/StatsCurrentPage";
import { StatsGamesPage } from "@/src/pages/StatsGamesPage";

export function App() {
  return (
    <TelegramProvider>
      <SyncOnOnline />
      <div className="appShell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/game/new" element={<NewGamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/tournament/new" element={<NewTournamentPage />} />
          <Route path="/tournament/:id" element={<TournamentPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/stats/players" element={<StatsPlayersPage />} />
          <Route path="/stats/players/:userId" element={<StatsPlayerPage />} />
          <Route path="/stats/current" element={<StatsCurrentPage />} />
          <Route path="/stats/games" element={<StatsGamesPage />} />
        </Routes>
      </div>
    </TelegramProvider>
  );
}
