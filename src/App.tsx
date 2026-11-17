import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ExtendedOnly } from "@/components/ExtendedOnly";
import { SyncOnOnline } from "@/components/game/SyncOnOnline";
import { SessionProvider } from "@/components/SessionProvider";
import { HomePage } from "@/src/pages/HomePage";

const TvPage = lazy(() =>
  import("@/src/pages/TvPage").then((m) => ({ default: m.TvPage }))
);
const NewGamePage = lazy(() =>
  import("@/src/pages/NewGamePage").then((m) => ({ default: m.NewGamePage }))
);
const GamePage = lazy(() =>
  import("@/src/pages/GamePage").then((m) => ({ default: m.GamePage }))
);
const NewTournamentPage = lazy(() =>
  import("@/src/pages/NewTournamentPage").then((m) => ({
    default: m.NewTournamentPage,
  }))
);
const TournamentPage = lazy(() =>
  import("@/src/pages/TournamentPage").then((m) => ({
    default: m.TournamentPage,
  }))
);
const StatsPage = lazy(() =>
  import("@/src/pages/StatsPage").then((m) => ({ default: m.StatsPage }))
);
const StatsPlayersPage = lazy(() =>
  import("@/src/pages/StatsPlayersPage").then((m) => ({
    default: m.StatsPlayersPage,
  }))
);
const StatsPlayerPage = lazy(() =>
  import("@/src/pages/StatsPlayerPage").then((m) => ({
    default: m.StatsPlayerPage,
  }))
);
const StatsCurrentPage = lazy(() =>
  import("@/src/pages/StatsCurrentPage").then((m) => ({
    default: m.StatsCurrentPage,
  }))
);
const StatsGamesPage = lazy(() =>
  import("@/src/pages/StatsGamesPage").then((m) => ({
    default: m.StatsGamesPage,
  }))
);

function RouteFallback() {
  return <div className="appShell" style={{ background: "#ffdf20" }} />;
}

export function App() {
  return (
    <SessionProvider>
      <SyncOnOnline />
      <div className="appShell">
        <Suspense fallback={<RouteFallback />}>
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
        </Suspense>
      </div>
    </SessionProvider>
  );
}
