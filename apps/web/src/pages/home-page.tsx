import { ChatRoom } from "@/components/home/chat-room";
import { LeftRail } from "@/components/home/left-rail";
import { LobbyMain } from "@/components/home/lobby-main";

export function HomePage() {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 overflow-y-auto xl:grid-cols-[240px_minmax(0,1fr)_300px] xl:overflow-hidden">
      <LeftRail />
      <LobbyMain />
      <ChatRoom />
    </div>
  );
}
