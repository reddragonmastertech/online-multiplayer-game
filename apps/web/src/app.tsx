import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ArenaFrame } from "@/components/layout/arena-frame";
import { AppShell } from "@/components/layout/app-shell";
import { AccountPage } from "@/pages/account-page";
import { BlankPage } from "@/pages/blank-page";
import { CpuMatchPage } from "@/pages/cpu-match-page";
import { GameRoomPage } from "@/pages/game-room-page";
import { HomePage } from "@/pages/home-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ArenaFrame />}>
          <Route index element={<HomePage />} />
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
