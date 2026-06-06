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
          <h2 className="font-semibold">Native Staking — Pick a Validator</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
        </div>

        {status === "success" ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-green-400 text-lg font-bold">Staked successfully</p>
            <p className="text-gray-400 text-sm">Your SOL is now delegated to {selected?.name}</p>
            <a
              href={`https://solscan.io/tx/${txSig}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 text-xs hover:text-purple-300"
            >
              View on Solscan ↗
            </a>
            <button onClick={onClose} className="block w-full mt-4 bg-white text-black py-2 rounded text-sm font-medium">Done</button>
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <input
              type="text"
              placeholder="Search validators..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm outline-none focus:border-gray-500"
            />

            <div className="space-y-1 max-h-52 overflow-y-auto">
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
