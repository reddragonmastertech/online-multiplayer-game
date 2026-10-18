import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { BlankPage } from "@/pages/blank-page";
import { HomePage } from "@/pages/home-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route index element={<HomePage />} />
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
