import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { BlankPage } from "@/pages/blank-page";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<BlankPage />} />
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
