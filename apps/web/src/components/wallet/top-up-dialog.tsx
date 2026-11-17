import {
  DEPOSIT_RULES,
  NETWORK_INFO,
  formatAmount,
  type DepositNetwork,
  type DepositOverview,
} from "@game-platform/shared";
import { Check, Copy, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiRequestError, claimDepositRequest, saveDepositWalletRequest } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Tabs in the order of the payment screenshots. */
const tabOrder: DepositNetwork[] = ["erc20", "bep20", "trc20"];

type Status = { tone: "success" | "pending" | "error"; text: string } | null;

function messageOf(error: unknown) {
  return error instanceof ApiRequestError || error instanceof Error ? error.message : "Something went wrong. Try again.";
}

export function UsdtMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-[#26a17b] font-bold text-white", className)}
    >
      ₮
    </span>
  );
}

const inputClass =
  "h-10 w-full min-w-0 rounded-xl border border-border bg-black/40 px-3 font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground/50 focus:ring-2 focus:ring-ring";

/**
 * Top Up By USDT. Three steps per network: save the wallet you pay from, send
 * USDT to our address, then paste the transaction ID so the server can check
 * it on the chain.
 */
export function TopUpDialog({
  overview,
  onClose,
  onChanged,
}: {
  overview: DepositOverview;
  onClose: () => void;
  /** Called after a wallet is saved or a deposit is credited. */
  onChanged: () => Promise<void> | void;
}) {
  const firstOpen = tabOrder.find((id) => overview.networks.find((item) => item.network === id)?.address) ?? "erc20";
  const [network, setNetwork] = useState<DepositNetwork>(firstOpen);
  const [editingWallet, setEditingWallet] = useState(false);
  const [walletDraft, setWalletDraft] = useState("");
  const [txDraft, setTxDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [copied, setCopied] = useState(false);

  const info = NETWORK_INFO[network];
  const ours = overview.networks.find((item) => item.network === network)?.address ?? null;
  const saved = overview.wallets.find((item) => item.network === network)?.address ?? null;
  const showWalletForm = !saved || editingWallet;

  useEffect(() => {
    setEditingWallet(false);
    setWalletDraft("");
    setTxDraft("");
    setWalletError(null);
    setStatus(null);
    setCopied(false);
  }, [network]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  async function saveWallet(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setWalletError(null);
    try {
      await saveDepositWalletRequest({ network, address: walletDraft.trim() });
      setEditingWallet(false);
      setWalletDraft("");
      await onChanged();
    } catch (error) {
      setWalletError(messageOf(error));
    } finally {
      setBusy(false);
    }
  }

  async function claim(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const { deposit } = await claimDepositRequest({ network, txId: txDraft.trim() });
      setStatus({
        tone: "success",
        text: `Credited ${formatAmount("usdt", deposit.credited)} (${formatAmount("usdt", deposit.amount)} received, ${formatAmount("usdt", deposit.fee)} fee).`,
      });
      setTxDraft("");
      await onChanged();
    } catch (error) {
      const code = error instanceof ApiRequestError ? error.code : "";
      setStatus({ tone: code === "deposit_pending" ? "pending" : "error", text: messageOf(error) });
    } finally {
      setBusy(false);
    }
  }

  async function copyAddress() {
    if (!ours) return;
    try {
      await navigator.clipboard.writeText(ours);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the address is still selectable.
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-background/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="top-up-title"
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-5 sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3 pr-10">
          <UsdtMark className="size-8 text-sm" />
          <h2 id="top-up-title" className="text-lg font-semibold">
            Top Up By USDT
          </h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 grid size-8 place-items-center rounded-full border border-border text-muted-foreground hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" aria-hidden="true" />
        </button>

        <div role="tablist" aria-label="Network" className="mt-5 grid grid-cols-3 gap-1 rounded-2xl bg-black/30 p-1">
          {tabOrder.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={network === id}
              onClick={() => setNetwork(id)}
              className={cn(
                "rounded-xl py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                network === id ? "bg-elevated text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {NETWORK_INFO[id].label}
            </button>
          ))}
        </div>

        {!ours ? (
          <p className="mt-5 rounded-2xl border border-border p-4 text-sm text-muted-foreground">
            {info.label} deposits are not open yet. Choose another network.
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            <section aria-labelledby="step-wallet">
              <h3 id="step-wallet" className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                1 · YOUR SENDING WALLET
              </h3>
              {showWalletForm ? (
                <form onSubmit={saveWallet} className="mt-2 space-y-2">
                  <label htmlFor="deposit-wallet" className="block text-sm text-muted-foreground">
                    The {info.label} wallet you will send USDT from. Only payments from it are credited.
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="deposit-wallet"
                      value={walletDraft}
                      onChange={(event) => setWalletDraft(event.target.value)}
                      placeholder={network === "trc20" ? "T…" : "0x…"}
                      autoComplete="off"
                      spellCheck={false}
                      className={inputClass}
                    />
                    <Button type="submit" size="sm" className="h-10" disabled={busy || !walletDraft.trim()}>
                      Save
                    </Button>
                  </div>
                  {walletError ? (
                    <p role="alert" className="text-sm font-semibold text-danger">
                      {walletError}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="mt-2 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
                  <code className="min-w-0 flex-1 break-all text-sm">{saved}</code>
                  <Button variant="ghost" size="sm" onClick={() => setEditingWallet(true)}>
                    Change
                  </Button>
                </div>
              )}
            </section>

            <section aria-labelledby="step-send">
              <h3 id="step-send" className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                2 · SEND USDT TO
              </h3>
              <p className="mt-2 text-sm font-semibold">{info.label} Address</p>
              <div className="mt-1 flex items-center gap-2 rounded-xl bg-black/30 px-3 py-2">
                <code className="min-w-0 flex-1 break-all text-sm font-semibold" data-testid="deposit-address">
                  {ours}
                </code>
                <Button variant="ghost" size="sm" onClick={copyAddress} aria-label={`Copy ${info.label} address`}>
                  {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <ul className="mt-3 list-disc space-y-1.5 rounded-2xl bg-black/20 py-3 pr-3 pl-7 text-sm text-muted-foreground">
                <li>Note that the minimum amount is: {formatAmount("usdt", DEPOSIT_RULES.minimum)}</li>
                <li>Confirmation need {DEPOSIT_RULES.confirmationTime}</li>
                <li>Handling Fee: {DEPOSIT_RULES.feeBps / 100}%</li>
                <li>
                  Send only USDT on {info.chain} ({info.label}). {info.note}
                </li>
                <li>
                  Please make sure to verify that the payment address is the same. We will not be held responsible if
                  the top-up fails due to an incorrect address.
                </li>
              </ul>
            </section>

            <section aria-labelledby="step-confirm">
              <h3 id="step-confirm" className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground">
                3 · CONFIRM YOUR PAYMENT
              </h3>
              <form onSubmit={claim} className="mt-2 space-y-2">
                <label htmlFor="deposit-tx" className="block text-sm text-muted-foreground">
                  After sending, paste the transaction ID (TxID) from your wallet.
                </label>
                <div className="flex gap-2">
                  <input
                    id="deposit-tx"
                    value={txDraft}
                    onChange={(event) => setTxDraft(event.target.value)}
                    placeholder={network === "trc20" ? "64 letters and digits" : "0x…"}
                    autoComplete="off"
                    spellCheck={false}
                    disabled={!saved}
                    className={inputClass}
                  />
                  <Button type="submit" size="sm" className="h-10" disabled={busy || !saved || !txDraft.trim()}>
                    {busy ? "Checking…" : "Confirm"}
                  </Button>
                </div>
                {!saved ? <p className="text-xs text-muted-foreground">Save your sending wallet first.</p> : null}
              </form>
              {status ? (
                <p
                  role="status"
                  className={cn(
                    "mt-3 rounded-xl px-3 py-2 text-sm font-semibold",
                    status.tone === "success" && "bg-primary/15 text-primary",
                    status.tone === "pending" && "bg-gold/15 text-gold",
                    status.tone === "error" && "bg-danger/15 text-danger",
                  )}
                >
                  {status.text}
                </p>
              ) : null}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
