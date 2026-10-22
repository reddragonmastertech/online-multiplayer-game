import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ArenaFrame } from "@/components/layout/arena-frame";
import { AppShell } from "@/components/layout/app-shell";
import { AccountPage } from "@/pages/account-page";
import { AuthEntryPage } from "@/pages/auth-entry-page";
import { BlankPage } from "@/pages/blank-page";
import { CpuMatchPage } from "@/pages/cpu-match-page";
import { GameLobbyPage } from "@/pages/game-lobby-page";
import { GameRoomPage } from "@/pages/game-room-page";
import { HowItWorksPage } from "@/pages/how-it-works-page";
import { IntroPage } from "@/pages/intro-page";
import { LeaderboardsPage } from "@/pages/leaderboards-page";
import { LegalPage } from "@/pages/legal-page";
import { LobbyPage } from "@/pages/lobby-page";
import { SupportPage } from "@/pages/support-page";
import { WatchPage } from "@/pages/watch-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ArenaFrame />}>
          <Route index element={<IntroPage />} />
          <Route path="lobby" element={<LobbyPage />} />
          <Route path="games" element={<LobbyPage />} />
          <Route path="games/:gameId" element={<GameLobbyPage />} />
          <Route path="watch" element={<WatchPage />} />
          <Route path="leaderboards" element={<LeaderboardsPage />} />
          <Route path="how-it-works" element={<HowItWorksPage />} />
          <Route path="support" element={<SupportPage />} />
          <Route path="legal/:doc" element={<LegalPage />} />
          <Route path="login" element={<AuthEntryPage tab="login" />} />
          <Route path="signup" element={<AuthEntryPage tab="signup" />} />
          <Route path="room/:matchId" element={<GameRoomPage />} />
          <Route path="matches/:matchId" element={<GameRoomPage />} />
          <Route path="vs/:stakeId" element={<CpuMatchPage />} />
          <Route path="account" element={<AccountPage />} />
        </Route>
        <Route element={<AppShell />}>
          <Route path="play" element={<BlankPage />} />
          <Route path="missions" element={<BlankPage />} />
          <Route path="ranking" element={<BlankPage />} />
          <Route path="wallet" element={<BlankPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
