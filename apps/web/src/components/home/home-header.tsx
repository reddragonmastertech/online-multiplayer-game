import { logoUrl } from "./portrait";
import { lobbyStats } from "./lobby-data";
import { useState } from "react";

function LogoMark() {
  const [src, setSrc] = useState(logoUrl);

  return (
    <img
      src={src}
      alt=""
      className="size-11 rounded-xl object-cover ring-1 ring-[#f3c969]/50"
      onError={() =>
        setSrc(
          "data:image/svg+xml," +
            encodeURIComponent(
              `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" fill="#1d4ed8"/><circle cx="64" cy="64" r="28" fill="#f3c969"/></svg>`,
            ),
        )
      }
    />
  );
}

export function HomeHeader() {
  return (
    <header className="z-20 grid shrink-0 grid-cols-1 items-center gap-3 border-b border-white/10 bg-[#070b14]/95 px-3 py-3 backdrop-blur sm:px-4 xl:grid-cols-[1fr_auto_1fr]">
      <div className="flex items-center gap-3">
        <LogoMark />
        <div>
          <h1 className="bg-gradient-to-r from-[#ffe7a3] via-[#f6d36b] to-[#e09a2b] bg-clip-text font-[Rajdhani,Inter,sans-serif] text-[1.7rem] font-bold leading-none tracking-wide text-transparent">
            RPS Arena
          </h1>
          <p className="mt-1 text-[11px] text-[#e7c56a]/85">
            Play More, Win Bigger, Earn Faster!
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 text-xs text-white/80">
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgb(52_211_153)]" />
          {lobbyStats.connected}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgb(56_189_248)]" />
          {lobbyStats.playing}
        </span>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          className="relative rounded-full bg-gradient-to-r from-[#ff6b8a] to-[#ff2d55] px-5 py-2 text-sm font-bold tracking-wide text-white shadow-[0_8px_24px_rgb(255_45_85/0.28)]"
        >
          FEEDBACK
          <span className="absolute -top-2 right-1 rounded-full bg-[#1a1408] px-1.5 py-0.5 text-[10px] font-semibold text-[#f3c969] ring-1 ring-[#f3c969]/60">
            +50 RAC
          </span>
        </button>
        <button
          type="button"
          className="rounded-full border border-white/15 bg-[#121a2b] px-5 py-2 text-sm text-white"
        >
          Log in
        </button>
      </div>
    </header>
  );
}
