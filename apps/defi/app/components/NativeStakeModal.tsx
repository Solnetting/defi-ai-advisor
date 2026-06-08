"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  StakeProgram,
  Authorized,
  Lockup,
  Keypair,
  LAMPORTS_PER_SOL,
  Transaction,
  PublicKey,
  Connection,
} from "@solana/web3.js";

interface Validator {
  vote_identity: string;
  name: string;
  commission: number;
  wiz_score: number;
  vote_success: number;
  activated_stake: number;
  is_jito: boolean;
}

interface Props {
  onClose: () => void;
  maxSOL: number;
}

export default function NativeStakeModal({ onClose, maxSOL }: Props) {
  const { publicKey, sendTransaction } = useWallet();
  useConnection(); // keep provider context
  const connection = new Connection(window.location.origin + "/api/rpc", "confirmed");
  const [validators, setValidators] = useState<Validator[]>([]);
  const [selected, setSelected] = useState<Validator | null>(null);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "confirming" | "success" | "error">("idle");
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCriteria, setShowCriteria] = useState(false);

  useEffect(() => {
    fetch("https://api.stakewiz.com/validators")
      .then((r) => r.json())
      .then((data: Validator[]) => {
        const filtered = data
          .filter((v) => !v.name?.includes("delinquent") && v.commission <= 10 && v.wiz_score > 50)
          .sort((a, b) => b.wiz_score - a.wiz_score)
          .slice(0, 50);
        setValidators(filtered);
      });
  }, []);

  // Score: vote reliability × fee efficiency × wiz quality × Jito MEV bonus
  function validatorScore(v: Validator): number {
    return (v.vote_success / 100) * ((100 - v.commission) / 100) * (v.wiz_score / 100) * (v.is_jito ? 1.05 : 1);
  }
  const aiPick = validators.length > 0
    ? validators.reduce((best, v) => validatorScore(v) > validatorScore(best) ? v : best)
    : null;

  const filtered = validators.filter((v) =>
    v.name?.toLowerCase().includes(search.toLowerCase())
  );

  async function stake() {
    if (!publicKey || !selected || !amount) return;
    const lamports = parseFloat(amount) * LAMPORTS_PER_SOL;
    if (isNaN(lamports) || lamports <= 0) return;

    setStatus("loading");
    setError("");

    try {
      const stakeAccount = Keypair.generate();
      const rentExempt = await connection.getMinimumBalanceForRentExemption(StakeProgram.space);
      const tx = new Transaction();

      tx.add(
        StakeProgram.createAccount({
          fromPubkey: publicKey,
          stakePubkey: stakeAccount.publicKey,
          authorized: new Authorized(publicKey, publicKey),
          lockup: new Lockup(0, 0, publicKey),
          lamports: lamports + rentExempt,
        })
      );

      tx.add(
        StakeProgram.delegate({
          stakePubkey: stakeAccount.publicKey,
          authorizedPubkey: publicKey,
          votePubkey: new PublicKey(selected.vote_identity),
        })
      );

      setStatus("confirming");
      const sig = await sendTransaction(tx, connection, { signers: [stakeAccount] });
      setTxSig(sig);
      setStatus("success");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Transaction failed");
      setStatus("error");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80" onClick={onClose} />
      <div className="relative bg-gray-950 border border-gray-700 rounded-xl w-full max-w-[358px]">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h2 className="font-semibold">Native Staking</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        {status === "success" ? (
          <div
            className="p-8 flex flex-col items-center gap-5"
            style={{ animation: "scale-in 0.35s cubic-bezier(0.34,1.56,0.64,1) both" }}
          >
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <circle
                cx="40" cy="40" r="26"
                stroke="#4ade80"
                strokeWidth="2"
                fill="none"
                strokeDasharray="164"
                strokeDashoffset="164"
                strokeLinecap="round"
                style={{ animation: "draw-circle 0.55s ease-out 0.1s both" }}
              />
              <path
                d="M 22 40 L 33 51 L 58 27"
                stroke="#4ade80"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                strokeDasharray="52"
                strokeDashoffset="52"
                style={{ animation: "draw-check 0.35s ease-out 0.55s both" }}
              />
            </svg>
            <div className="text-center space-y-1.5">
              <p className="text-white text-lg font-bold">Staked successfully</p>
              <p className="text-gray-500 text-sm">Delegated to {selected?.name}</p>
            </div>
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 text-xs hover:text-purple-300 transition-colors"
            >
              View on Solscan ↗
            </a>
            <button
              onClick={onClose}
              className="w-full bg-white text-black py-3.5 rounded-full text-sm font-semibold hover:bg-gray-100 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-4">

            {/* ✦ AI Pick validator */}
            {aiPick && (
              <div
                onClick={() => setSelected(aiPick)}
                className={`cursor-pointer bg-purple-950/40 border rounded-xl px-4 py-3 transition-colors ${selected?.vote_identity === aiPick.vote_identity ? "border-purple-500" : "border-purple-800/50 hover:border-purple-700/60"}`}
              >
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="text-purple-400 text-xs">✦</span>
                  <span className="text-purple-400 text-xs font-medium uppercase tracking-wide">AI Pick</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowCriteria(s => !s); }}
                    className="text-purple-400/50 hover:text-purple-400 text-xs leading-none transition-colors"
                    aria-label="How was this picked?"
                  >ⓘ</button>
                </div>
                {showCriteria && (
                  <p className="text-[10px] text-gray-500 leading-relaxed mb-2">
                    Picks the most reliable validator — scored by uptime, low commission, and overall quality. Jito validators get a small bonus for MEV rewards.
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{aiPick.name || aiPick.vote_identity.slice(0, 12) + "…"}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {aiPick.commission}% fee · Score {aiPick.wiz_score.toFixed(0)}{aiPick.is_jito ? " · Jito MEV" : ""}
                    </p>
                  </div>
                  <span className="text-xs text-green-400">{aiPick.vote_success.toFixed(1)}% uptime</span>
                </div>
              </div>
            )}

            <input
              type="text"
              placeholder="Or search all validators…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-gray-500"
            />

            <div className="space-y-1 max-h-44 overflow-y-auto">
              {filtered.length === 0 && <p className="text-gray-500 text-sm text-center py-4">Loading validators...</p>}
              {filtered.map((v) => (
                <button
                  key={v.vote_identity}
                  onClick={() => setSelected(v)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded text-sm transition-colors ${selected?.vote_identity === v.vote_identity ? "bg-gray-700" : "hover:bg-gray-900"}`}
                >
                  <div className="text-left">
                    <p className="font-medium truncate max-w-xs">{v.name || v.vote_identity.slice(0, 12) + "..."}</p>
                    <p className="text-xs text-gray-500">Score: {v.wiz_score.toFixed(0)} · Commission: {v.commission}%{v.is_jito ? " · Jito MEV" : ""}</p>
                  </div>
                  <span className="text-xs text-green-400 ml-2">{v.vote_success.toFixed(1)}%</span>
                </button>
              ))}
            </div>

            {selected && (
              <div className="border border-gray-700 rounded p-3 text-sm">
                <p className="text-gray-400 text-xs mb-2">Selected: <span className="text-white">{selected.name}</span></p>
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder={`Amount (max ${maxSOL.toFixed(2)} SOL)`}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    max={maxSOL}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={() => setAmount(Math.max(0, maxSOL - 0.01).toFixed(4))}
                    className="text-xs text-purple-400 hover:text-purple-300 px-2"
                  >
                    Max
                  </button>
                </div>
              </div>
            )}

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={stake}
              disabled={!selected || !amount || status === "loading" || status === "confirming"}
              className="w-full bg-white text-black py-2 rounded text-sm font-medium disabled:opacity-40"
            >
              {status === "loading" ? "Preparing..." : status === "confirming" ? "Approve in Phantom..." : "Stake SOL"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
