import { Route, Routes } from "react-router-dom";
import { ExtendedOnly } from "@/components/ExtendedOnly";
import { SyncOnOnline } from "@/components/game/SyncOnOnline";
import { SessionProvider } from "@/components/SessionProvider";
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
import { TvPage } from "@/src/pages/TvPage";

export function App() {
  return (
    <SessionProvider>
      <SyncOnOnline />
      <div className="appShell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/tv" element={<TvPage />} />
          <Route path="/tv/:tournamentId" element={<TvPage />} />
          <Route path="/game/new" element={<NewGamePage />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route
            path="/tournament/new"
            element={
              <ExtendedOnly>
                <NewTournamentPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/tournament/:id"
            element={
              <ExtendedOnly>
                <TournamentPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/stats"
            element={
              <ExtendedOnly>
                <StatsPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/stats/players"
            element={
              <ExtendedOnly>
                <StatsPlayersPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/stats/players/:userId"
            element={
              <ExtendedOnly>
                <StatsPlayerPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/stats/current"
            element={
              <ExtendedOnly>
                <StatsCurrentPage />
              </ExtendedOnly>
            }
          />
          <Route
            path="/stats/games"
            element={
              <ExtendedOnly>
                <StatsGamesPage />
              </ExtendedOnly>
            }
          />
        </Routes>
      </div>
    </SessionProvider>
  );
}
