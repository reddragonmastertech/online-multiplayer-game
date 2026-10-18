import { Send, Smile, Sticker } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  chatMessages,
  emojis,
  lobbyStats,
  panelClass,
  stickers,
  type ChatMessage,
} from "./lobby-data";
import { Photo, Portrait } from "./portrait";
import { cn } from "@/lib/utils";

export function ChatRoom() {
  const [messages, setMessages] = useState<ChatMessage[]>(chatMessages);
  const [draft, setDraft] = useState("");
  const [tray, setTray] = useState<"emoji" | "stickers">("emoji");
  const listRef = useRef<HTMLUListElement>(null);
  const skipScroll = useRef(true);

  useEffect(() => {
    if (skipScroll.current) {
      skipScroll.current = false;
      return;
    }

    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  function send(message: Omit<ChatMessage, "id" | "name" | "avatar" | "when">) {
    setMessages((current) => [
      ...current,
      {
        id: `local-${current.length + 1}`,
        name: "You",
        avatar: 64,
        when: "Now",
        ...message,
      },
    ]);
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    send({ text });
    setDraft("");
  }

  return (
    <aside className="p-3 xl:h-full xl:min-h-0 xl:overflow-hidden xl:pl-0">
      <section className={cn(panelClass, "flex h-[32rem] min-h-[28rem] flex-col xl:h-full")}>
        <header className="flex items-center justify-between border-b border-white/10 px-3 py-3">
          <h2 className="text-xs font-semibold tracking-[0.16em]">CHAT ROOM</h2>
          <p className="inline-flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            {lobbyStats.chatOnline}
          </p>
        </header>

        <ul
          ref={listRef}
          className="arena-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
        >
          {messages.map((message) => (
            <li key={message.id} className="flex gap-2">
              <Portrait
                id={message.avatar}
                name={message.name}
                className="size-8 shrink-0 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-[#f3d48a]">{message.name}</p>
                  <p className="shrink-0 text-[10px] text-white/35">{message.when}</p>
                </div>
                {message.text === "100" ? (
                  <p className="text-2xl font-black tracking-tight text-orange-500">100</p>
                ) : (
                  message.text && <p className="text-sm leading-snug text-white/85">{message.text}</p>
                )}
                {message.image && (
                  <Photo
                    seed={message.image}
                    name={`${message.name} attachment`}
                    className="mt-1 h-24 w-36 rounded-lg"
                  />
                )}
              </div>
            </li>
          ))}
        </ul>

        <form
          className="border-t border-white/10 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center rounded-full border border-white/10 bg-black/40 px-3">
              <input
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="Message"
                placeholder="Type a message..."
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
              />
              <Smile className="size-4 text-white/40" aria-hidden="true" />
            </div>
            <button
              type="submit"
              className="rounded-full border border-[#f3c969]/40 px-3 py-2 text-[11px] font-semibold tracking-[0.14em] text-[#f3c969]"
            >
              <Send className="mr-1 inline size-3" aria-hidden="true" />
              SEND
            </button>
          </div>
        </form>

        <div className="border-t border-white/10 px-3 pb-3 pt-2">
          <div className="mb-2 flex gap-4 text-[11px] font-semibold tracking-[0.14em]">
            <button
              type="button"
              aria-pressed={tray === "emoji"}
              onClick={() => setTray("emoji")}
              className={cn(
                "inline-flex items-center gap-1",
                tray === "emoji" ? "text-[#f3c969]" : "text-white/40",
              )}
            >
              <Smile className="size-3.5" aria-hidden="true" />
              EMOJI
            </button>
            <button
              type="button"
              aria-pressed={tray === "stickers"}
              onClick={() => setTray("stickers")}
              className={cn(
                "inline-flex items-center gap-1",
                tray === "stickers" ? "text-[#f3c969]" : "text-white/40",
              )}
            >
              <Sticker className="size-3.5" aria-hidden="true" />
              STICKERS
            </button>
          </div>
          {tray === "emoji" ? (
            <div className="grid grid-cols-8 gap-1">
              {emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="grid h-8 place-items-center rounded-lg bg-white/5 text-base hover:bg-white/10"
                  aria-label={`Insert ${emoji}`}
                  onClick={() => setDraft((current) => `${current}${emoji}`)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {stickers.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  className="overflow-hidden rounded-lg"
                  aria-label={`Send ${seed} sticker`}
                  onClick={() => send({ image: seed })}
                >
                  <Photo seed={seed} name={seed} className="h-14 w-full" />
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </aside>
  );
}
