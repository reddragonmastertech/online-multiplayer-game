import { CHAT_RULES, quickReactions, type ChatMessage, type Seat } from "@game-platform/shared";
import { ChevronDown, MessageSquare, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Players-only match chat. The server refuses spectators and never sends them
 * messages; this component is simply not rendered for them. Chat is optional
 * to play: the board never depends on it.
 */
export function MatchChat({
  messages,
  yourSeat,
  opponentName,
  muted,
  closed,
  onSend,
  onToggleMute,
}: {
  messages: ChatMessage[];
  yourSeat: Seat;
  opponentName: string;
  muted: boolean;
  /** The match is over; the server has dropped this chat. */
  closed: boolean;
  onSend: (text: string) => void;
  onToggleMute: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLOListElement>(null);
  const stickToBottom = useRef(true);

  const visible = muted ? messages.filter((message) => message.seat === yourSeat) : messages;

  // Follow new messages only when the reader is already at the bottom, so
  // scrolling up to read older ones is not yanked away.
  useEffect(() => {
    const list = listRef.current;
    if (list && stickToBottom.current) list.scrollTop = list.scrollHeight;
  }, [visible.length, open]);

  function onScroll() {
    const list = listRef.current;
    if (!list) return;
    stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 24;
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) return;
    onSend(draft);
    setDraft("");
    stickToBottom.current = true;
  }

  return (
    <section aria-labelledby="match-chat-heading" className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="match-chat-body"
          className="inline-flex items-center gap-2 rounded-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MessageSquare className="size-4 text-primary" aria-hidden="true" />
          <h3 id="match-chat-heading" className="text-xs font-semibold tracking-[0.16em] text-muted-foreground">
            MATCH CHAT
          </h3>
          <span className="text-[11px] text-muted-foreground/80">· players only</span>
          <ChevronDown
            className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleMute}
          aria-pressed={muted}
          aria-label={muted ? `Unmute ${opponentName}` : `Mute ${opponentName}`}
        >
          {muted ? <VolumeX className="size-4" aria-hidden="true" /> : <Volume2 className="size-4" aria-hidden="true" />}
          {muted ? "Muted" : "Mute"}
        </Button>
      </div>

      {open ? (
        <div id="match-chat-body" className="border-t border-border px-4 pb-4">
          <ol
            ref={listRef}
            onScroll={onScroll}
            role="log"
            aria-live="polite"
            aria-label="Chat messages"
            className="mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1"
          >
            {visible.length === 0 ? (
              <li className="text-sm text-muted-foreground/80">
                {muted ? `${opponentName} is muted.` : "No messages yet. Say hi, or tap a reaction."}
              </li>
            ) : (
              visible.map((message) => {
                const mine = message.seat === yourSeat;
                return (
                  <li key={message.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                    <p
                      className={cn(
                        "max-w-[85%] break-words rounded-2xl px-3 py-1.5 text-sm",
                        mine ? "bg-primary/15 text-foreground" : "bg-black/30 text-foreground",
                      )}
                    >
                      <span className={cn("mr-1.5 text-[11px] font-semibold", mine ? "text-primary" : "text-gold")}>
                        {mine ? "You" : message.name}
                      </span>
                      {message.text}
                    </p>
                  </li>
                );
              })
            )}
          </ol>

          {closed ? (
            <p className="mt-3 text-xs text-muted-foreground">Chat closed. The match is over.</p>
          ) : (
            <>
              <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Quick reactions">
                {quickReactions.map((reaction) => (
                  <button
                    key={reaction}
                    type="button"
                    onClick={() => onSend(reaction)}
                    className="rounded-full border border-border px-3 py-1 text-sm hover:bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {reaction}
                  </button>
                ))}
              </div>
              <form onSubmit={submit} className="mt-3 flex gap-2">
                <label htmlFor="match-chat-input" className="sr-only">
                  Message your opponent
                </label>
                <input
                  id="match-chat-input"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  maxLength={CHAT_RULES.maxLength}
                  autoComplete="off"
                  placeholder="Message your opponent"
                  className="h-10 min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                <Button type="submit" size="sm" className="h-10" disabled={!draft.trim()}>
                  Send
                </Button>
              </form>
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
