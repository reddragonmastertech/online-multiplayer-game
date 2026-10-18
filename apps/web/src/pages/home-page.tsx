import { ChatRoom } from "@/components/home/chat-room";
import { HomeHeader } from "@/components/home/home-header";
import { LeftRail } from "@/components/home/left-rail";
import { LobbyMain } from "@/components/home/lobby-main";

export function HomePage() {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[#070b14] font-[Inter,Segoe_UI,sans-serif] text-white">
      <HomeHeader />
      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:overflow-hidden">
        <LeftRail />
        <LobbyMain />
        <ChatRoom />
      </div>
    </div>
  );
}
