"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  StakeProgram,
  Authorized,
  Lockup,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  PublicKey,
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";

const LIQUID_PROTOCOLS = [
  { label: "Jito",       symbol: "JitoSOL", mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn", desc: "MEV rewards on top of base APY" },
  { label: "Marinade",   symbol: "MSOL",    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", desc: "Auto-diversified, battle-tested" },
  { label: "BlazeStake", symbol: "BSOL",    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1", desc: "Decentralized validator set" },
  { label: "JupSOL",     symbol: "JUPSOL",  mint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v", desc: "Jupiter ecosystem" },
] as const;

type LiquidProtocol = typeof LIQUID_PROTOCOLS[number];

interface Validator {
  vote_identity: string;
  name: string;
  commission: number;
  wiz_score: number;
  vote_success: number;
  staking_apy: number;
  activated_stake: number;
  is_jito: boolean;
}

interface Props {
  onClose: () => void;
  maxSOL: number;
}

export default function NativeStakeModal({ onClose, maxSOL }: Props) {
  const { publicKey, sendTransaction } = useWallet();
  const { setVisible } = useWalletModal();
  useConnection();
  const connection = new Connection(window.location.origin + "/api/rpc", "confirmed");

  const [mode, setMode] = useState<"native" | "liquid">("native");

  // Native
  const [validators, setValidators]   = useState<Validator[]>([]);
  const [selected, setSelected]       = useState<Validator | null>(null);
  const [search, setSearch]           = useState("");
  const [showCriteria, setShowCriteria] = useState(false);

  // Liquid
  const [apyMap, setApyMap]                     = useState<Record<string, number>>({});
  const [selectedProtocol, setSelectedProtocol] = useState<LiquidProtocol | null>(null);
  const [quote, setQuote]                       = useState<Record<string, unknown> | null>(null);
  const [quotePending, setQuotePending]         = useState(false);

  // Shared
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "confirming" | "success" | "error">("idle");
  const [txSig, setTxSig]   = useState("");
  const [error, setError]   = useState("");

  // Validators
  useEffect(() => {
    fetch("https://api.stakewiz.com/validators")
      .then((r) => r.json())
      .then((data: Validator[]) =>
        setValidators(
          data
            .filter((v) => !v.name?.includes("delinquent") && v.commission <= 10 && v.wiz_score > 50)
            .sort((a, b) => b.wiz_score - a.wiz_score)
            .slice(0, 50)
        )
      )
      .catch(() => {});
  }, []);

  // Yields for liquid APY
  useEffect(() => {
    fetch("/api/yields")
      .then((r) => r.json())
      .then((yields: { symbol: string; apy: number }[]) => {
        const map: Record<string, number> = {};
        for (const y of yields) map[y.symbol] = y.apy;
        setApyMap(map);
      })
      .catch(() => {});
  }, []);

  // Jupiter quote for liquid staking
  useEffect(() => {
    if (mode !== "liquid" || !selectedProtocol || !amount || parseFloat(amount) <= 0) {
      setQuote(null);
      return;
    }
    const t = setTimeout(async () => {
      setQuotePending(true);
      try {
        const lamports = Math.round(parseFloat(amount) * LAMPORTS_PER_SOL);
        const res = await fetch(
          `https://api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${selectedProtocol.mint}&amount=${lamports}&slippageBps=50`
        );
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        setQuote(data);
      } catch { setQuote(null); }
      finally { setQuotePending(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [amount, selectedProtocol, mode]);

  function validatorScore(v: Validator) {
    const apy     = (v.staking_apy ?? 0) / 10;        // ~7% APY → 0.7
    const uptime  = v.vote_success / 100;
    const fee     = (100 - v.commission) / 100;
    return apy * 0.6 + uptime * 0.25 + fee * 0.15;
  }
  const aiPick = validators.length > 0
    ? validators.reduce((b, v) => validatorScore(v) > validatorScore(b) ? v : b)
    : null;

  const filteredValidators = validators.filter((v) =>
    v.name?.toLowerCase().includes(search.toLowerCase())
  );

  // Liquid AI pick = highest APY
  const liquidAIPick = [...LIQUID_PROTOCOLS].sort((a, b) =>
    (apyMap[b.symbol] ?? 0) - (apyMap[a.symbol] ?? 0)
  )[0] ?? LIQUID_PROTOCOLS[0];

  const outAmount = quote
    ? (Number(quote.outAmount) / 1e9).toFixed(4)
    : null;

  async function stakeNative() {
    if (!publicKey || !selected || !amount) return;
    const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;
    if (isNaN(lamports) || lamports <= 0) return;
    setStatus("loading"); setError("");
    try {
      const stakeAccount = Keypair.generate();
      const rentExempt = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
      const tx = new Transaction();
      tx.add(StakeProgram.createAccount({
        fromPubkey: publicKey,
        stakePubkey: stakeAccount.publicKey,
        authorized: new Authorized(publicKey, publicKey),
        lockup: new Lockup(0, 0, publicKey),
        lamports: lamports + rentExempt,
      }));
      tx.add(StakeProgram.delegate({
        stakePubkey: stakeAccount.publicKey,
        authorizedPubkey: publicKey,
        votePubkey: new PublicKey(selected.vote_identity),
      }));
      setStatus("confirming");
      const sig = await sendTransaction(tx, connection, { signers: [stakeAccount] });
      setTxSig(sig); setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus("error");
    }
  }

  async function stakeLiquid() {
    if (!publicKey || !quote || !selectedProtocol) return;
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quoteResponse: quote, userPublicKey: publicKey.toBase58() }),
      });
      const { swapTransaction, error: swapErr } = await res.json();
      if (swapErr) throw new Error(swapErr);
      const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
      setStatus("confirming");
      const sig = await sendTransaction(tx, connection, { maxRetries: 3 });
      await connection.confirmTransaction(sig, "confirmed");
      setTxSig(sig); setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus("error");
    }
  }

  const successDetail = mode === "native"
    ? `Delegated to ${selected?.name}`
    : `Received ≈ ${outAmount} ${selectedProtocol?.symbol}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-gray-950 border border-gray-700 rounded-xl w-full max-w-[358px] max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="font-semibold">Stake SOL</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        {status === "success" ? (
          <div className="p-8 flex flex-col items-center gap-5" style={{ animation: "scale-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}>
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle cx="40" cy="40" r="26" stroke="#4ade80" strokeWidth="2" fill="none"
                strokeDasharray="164" strokeDashoffset="164" strokeLinecap="round"
                style={{ animation: "draw-circle 0.55s ease-out 0.1s both" }} />
              <path d="M 22 40 L 33 51 L 58 27" stroke="#4ade80" strokeWidth="3"
                strokeLinecap="round" strokeLinejoin="round" fill="none"
                strokeDasharray="52" strokeDashoffset="52"
                style={{ animation: "draw-check 0.35s ease-out 0.55s both" }} />
            </svg>
            <div className="text-center space-y-1.5">
              <p className="text-white text-lg font-bold">Staked successfully</p>
              <p className="text-gray-500 text-sm">{successDetail}</p>
            </div>
            <a href={`https://solscan.io/tx/${txSig}`} target="_blank" rel="noopener noreferrer"
              className="text-purple-400 text-xs hover:text-purple-300 transition-colors">
              View on Solscan ↗
            </a>
            <button onClick={onClose}
              className="w-full bg-white text-black py-3.5 rounded-full text-sm font-semibold hover:bg-gray-100 transition-colors">
              Done
            </button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 p-4 space-y-4">

            {/* Mode toggle */}
            <div className="flex gap-1 bg-gray-900 rounded-full p-1">
              {(["native", "liquid"] as const).map((m) => (
                <button key={m} onClick={() => { setMode(m); setAmount(""); setQuote(null); setError(""); setSelected(null); setSelectedProtocol(null); }}
                  className={`flex-1 py-1.5 rounded-full text-xs font-medium transition-colors ${mode === m ? "bg-white text-black" : "text-gray-500 hover:text-white"}`}>
                  {m === "native" ? "Native" : "Liquid"}
                </button>
              ))}
            </div>

            {mode === "native" ? (
              <>
                {/* Native AI pick */}
                {aiPick && (
                  <div onClick={() => setSelected(aiPick)}
                    className={`cursor-pointer bg-purple-950/40 border rounded-xl px-4 py-3 transition-colors ${selected?.vote_identity === aiPick.vote_identity ? "border-purple-500" : "border-purple-800/50 hover:border-purple-700/60"}`}>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-purple-400 text-xs">✦</span>
                      <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick</span>
                      <button onClick={(e) => { e.stopPropagation(); setShowCriteria(s => !s); }}
                        className="text-purple-400/50 hover:text-purple-400 text-xs leading-none transition-colors">ⓘ</button>
                    </div>
                    {showCriteria && (
                      <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                        Scored by uptime × low commission × WizScore. Jito validators get a small MEV bonus.
                      </p>
                    )}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-white">{aiPick.name || aiPick.vote_identity.slice(0, 12) + "…"}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {aiPick.vote_success.toFixed(1)}% uptime · {aiPick.commission}% fee{aiPick.is_jito ? " · Jito MEV" : ""}
                        </p>
                      </div>
                      <span className="text-xs text-green-400 font-medium shrink-0 ml-2">
                        {aiPick.staking_apy != null ? `${aiPick.staking_apy.toFixed(2)}% APY` : "—"}
                      </span>
                    </div>
                  </div>
                )}

                <input type="text" placeholder="Search validators…" value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-gray-500" />

                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {filteredValidators.length === 0 && (
                    <p className="text-gray-500 text-sm text-center py-4">Loading validators…</p>
                  )}
                  {filteredValidators.map((v) => (
                    <button key={v.vote_identity} onClick={() => setSelected(v)}
                      className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${selected?.vote_identity === v.vote_identity ? "bg-gray-700" : "hover:bg-gray-900"}`}>
                      <div className="text-left">
                        <p className="font-medium truncate max-w-[200px]">{v.name || v.vote_identity.slice(0, 12) + "..."}</p>
                        <p className="text-xs text-gray-500">
                          {v.vote_success.toFixed(1)}% uptime · {v.commission}% fee{v.is_jito ? " · Jito" : ""}
                        </p>
                      </div>
                      <span className="text-xs text-green-400 font-medium ml-2 shrink-0">
                        {v.staking_apy != null ? `${v.staking_apy.toFixed(2)}%` : "—"}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Liquid AI pick */}
                <div onClick={() => setSelectedProtocol(liquidAIPick)}
                  className={`cursor-pointer bg-purple-950/40 border rounded-xl px-4 py-3 transition-colors ${selectedProtocol?.mint === liquidAIPick.mint ? "border-purple-500" : "border-purple-800/50 hover:border-purple-700/60"}`}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-purple-400 text-xs">✦</span>
                    <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick · Highest APY</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{liquidAIPick.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{liquidAIPick.desc} · {liquidAIPick.symbol}</p>
                    </div>
                    <span className="text-xs text-green-400">
                      {apyMap[liquidAIPick.symbol] != null ? `${apyMap[liquidAIPick.symbol]}% APY` : "—"}
                    </span>
                  </div>
                </div>

                {/* Protocol list */}
                <div className="space-y-2">
                  {LIQUID_PROTOCOLS.map((p) => {
                    const apy = apyMap[p.symbol];
                    const isSelected = selectedProtocol?.mint === p.mint;
                    return (
                      <button key={p.mint} onClick={() => setSelectedProtocol(p)}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm transition-colors ${isSelected ? "border-gray-500 bg-gray-800" : "border-gray-800 hover:border-gray-700 hover:bg-gray-900"}`}>
                        <div className="text-left">
                          <p className="font-medium">{p.label} <span className="text-gray-600 font-normal">· {p.symbol}</span></p>
                          <p className="text-xs text-gray-500">{p.desc}</p>
                        </div>
                        <span className={`text-xs font-medium shrink-0 ml-2 ${apy != null ? "text-green-400" : "text-gray-700"}`}>
                          {apy != null ? `${apy}% APY` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] text-gray-700 px-1">
                  Executed via Jupiter best route. You receive liquid staking tokens redeemable 1:1 for SOL.
                </p>
              </>
            )}

            {/* Amount + CTA */}
            {!publicKey ? (
              <button onClick={() => setVisible(true)}
                className="w-full bg-white text-black py-3.5 rounded-full text-sm font-semibold hover:bg-gray-100 transition-colors">
                {mode === "native" && selected
                  ? `Connect wallet to stake with ${selected.name?.split(" ")[0] ?? "validator"}`
                  : mode === "liquid" && selectedProtocol
                  ? `Connect wallet to stake with ${selectedProtocol.label}`
                  : "Connect wallet to stake"}
              </button>
            ) : (
              <>
                {(mode === "native" ? !!selected : !!selectedProtocol) && (
                  <div className="border border-gray-700 rounded-lg p-3 space-y-2">
                    <p className="text-xs text-gray-500">
                      Selected: <span className="text-white">{mode === "native" ? selected?.name : selectedProtocol?.label}</span>
                    </p>
                    <div className="flex gap-2">
                      <input type="text" inputMode="decimal"
                        placeholder={`Amount (max ${maxSOL.toFixed(4)} SOL)`}
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-gray-500" />
                      <button onClick={() => setAmount(Math.max(0, maxSOL - 0.005).toFixed(4))}
                        className="text-xs text-purple-400 hover:text-purple-300 px-2">Max</button>
                    </div>
                    {mode === "liquid" && (
                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-gray-600">You receive</span>
                        <span className="text-green-400">
                          {quotePending ? "…" : outAmount ? `≈ ${outAmount} ${selectedProtocol?.symbol}` : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <button
                  onClick={mode === "native" ? stakeNative : stakeLiquid}
                  disabled={mode === "native"
                    ? (!selected || !amount || status === "loading" || status === "confirming")
                    : (!selectedProtocol || !quote || quotePending || status === "loading" || status === "confirming")}
                  className="w-full bg-white text-black py-3.5 rounded-full text-sm font-semibold disabled:opacity-40 hover:bg-gray-100 transition-colors">
                  {status === "loading" ? "Preparing…"
                    : status === "confirming" ? "Approve in wallet…"
                    : mode === "native" ? "Stake SOL"
                    : selectedProtocol ? `Stake with ${selectedProtocol.label}`
                    : "Select a protocol"}
                </button>
              </>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
