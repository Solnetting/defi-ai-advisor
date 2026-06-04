"use client";

import { useState, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import NativeStakeModal from "./components/NativeStakeModal";

interface YieldOption {
  label: string;
  symbol: string;
  apy: number;
  tvlUsd: number;
  risk: string;
  liquidity: string;
  url: string;
}

interface Token {
  mint: string;
  amount: number;
  decimals: number;
  name: string | null;
  symbol: string | null;
}

interface KaminoPosition {
  name: string;
  type: string;
  amountSOL: number;
  netValueUsd: number;
}

interface WalletData {
  solBalance: number;
  stakedSOL: number;
  kaminoSOL: number;
  idleSOL: number;
  solPrice: number;
  kaminoPositions: KaminoPosition[];
  tokens: Token[];
  error?: string;
}

function usd(sol: number, price: number) {
  return (sol * price).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export default function Home() {
  const { publicKey, connected } = useWallet();
  const [address, setAddress] = useState("");
  const [data, setData] = useState<WalletData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showAllTokens, setShowAllTokens] = useState(false);
  const [projectionYears, setProjectionYears] = useState(3);
  const [yields, setYields] = useState<YieldOption[]>([]);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [stakeModalOpen, setStakeModalOpen] = useState(false);

  useEffect(() => {
    if (connected && publicKey) {
      const addr = publicKey.toBase58();
      setAddress(addr);
      analyze(addr);
    }
  }, [connected, publicKey]);

  useEffect(() => {
    fetch("/api/yields").then((r) => r.json()).then((d) => Array.isArray(d) && setYields(d));
  }, []);

  async function analyze(addr?: string) {
    const target = addr ?? address.trim();
    if (!target) return;
    setLoading(true);
    setError("");
    setData(null);

    try {
      const res = await fetch(`/api/wallet?address=${target}`);
      const json = await res.json();
      if (json.error) setError(json.error);
      else setData(json);
    } catch {
      setError("Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function sendChat() {
    if (!chatInput.trim() || !data) return;
    const userMsg = { role: "user", content: chatInput.trim() };
    const updated = [...chatMessages, userMsg];
    setChatMessages(updated);
    setChatInput("");
    setChatLoading(true);

    const context = `
SOL Balance: ${data.solBalance.toFixed(2)} SOL ($${(data.solBalance * data.solPrice).toLocaleString()})
Staked SOL: ${data.stakedSOL.toFixed(2)} SOL
Idle SOL: ${data.idleSOL.toFixed(2)} SOL ($${(data.idleSOL * data.solPrice).toLocaleString()})
Kamino Positions: ${data.kaminoPositions.map(p => `${p.name}: ${p.amountSOL.toFixed(2)} SOL ($${p.netValueUsd.toFixed(0)})`).join(", ") || "None"}
SOL Price: $${data.solPrice}
Live APYs: ${yields.map(y => `${y.label} ${y.apy}%`).join(", ")}
    `.trim();

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: updated, context }),
      });
      const json = await res.json();
      setChatMessages([...updated, { role: "assistant", content: json.reply }]);
    } catch {
      setChatMessages([...updated, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setChatLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-black text-white p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold">DeFi AI Advisor</h1>
        <WalletMultiButton style={{ fontSize: 13, height: 36, background: connected ? "#166534" : "#1f2937" }} />
      </div>
      <p className="text-gray-400 mb-6 text-sm">
        {connected ? `Connected: ${publicKey?.toBase58().slice(0, 6)}...${publicKey?.toBase58().slice(-4)}` : "Connect your wallet or paste an address below."}
      </p>

      {!connected && (
        <div className="flex gap-2 mb-8">
          <input
            type="text"
            placeholder="Solana wallet address..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && analyze()}
            className="flex-1 bg-gray-900 border border-gray-700 rounded px-4 py-2 text-sm outline-none focus:border-gray-400"
          />
          <button
            onClick={() => analyze()}
            disabled={loading}
            className="bg-white text-black px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Analyzing..." : "Analyze"}
          </button>
        </div>
      )}

      {loading && <p className="text-gray-400 text-sm mb-6">Analyzing wallet...</p>}

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {data && (
        <div className="space-y-4">
          <div className="border border-gray-700 rounded p-4">
            <p className="text-gray-400 text-xs mb-1">Total SOL Balance</p>
            <p className="text-3xl font-bold">{data.solBalance.toFixed(2)} SOL</p>
            <p className="text-gray-400 text-sm mt-1">{usd(data.solBalance, data.solPrice)}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="border border-green-800 bg-green-950 rounded p-3">
              <p className="text-green-400 text-xs mb-1">Staked</p>
              <p className="text-xl font-bold text-green-300">{data.stakedSOL.toFixed(2)} SOL</p>
              <p className="text-green-500 text-xs mt-1">{usd(data.stakedSOL, data.solPrice)}</p>
              <p className="text-green-700 text-xs mt-1">Earning yield</p>
            </div>
            <div className={`border rounded p-3 ${data.idleSOL > 0 ? "border-red-800 bg-red-950" : "border-gray-700"}`}>
              <p className="text-red-400 text-xs mb-1">Idle</p>
              <p className="text-xl font-bold text-red-300">{data.idleSOL.toFixed(2)} SOL</p>
              <p className="text-red-500 text-xs mt-1">{usd(data.idleSOL, data.solPrice)}</p>
              <p className="text-red-700 text-xs mt-1">Earning 0%</p>
            </div>
            <div className="border border-blue-800 bg-blue-950 rounded p-3">
              <p className="text-blue-400 text-xs mb-1">Deployed</p>
              <p className="text-xl font-bold text-blue-300">{data.kaminoSOL.toFixed(2)} SOL</p>
              <p className="text-blue-500 text-xs mt-1">${(data.kaminoPositions.reduce((s, p) => s + p.netValueUsd, 0)).toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
              <p className="text-blue-700 text-xs mt-1">In Kamino</p>
            </div>
          </div>

          <div className="border border-gray-700 rounded-xl overflow-hidden">
            <button
              onClick={() => setChatOpen(!chatOpen)}
              className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">💬</span>
                <span className="text-sm font-medium">Ask your AI Advisor</span>
              </div>
              <span className="text-gray-500 text-xs">{chatOpen ? "▲" : "▼"}</span>
            </button>
            {chatOpen && (
              <>
                <div className="px-4 pb-3 space-y-3 max-h-72 overflow-y-auto border-t border-gray-800 pt-3">
                  {chatMessages.length === 0 && (
                    <p className="text-gray-600 text-xs">Try: "What should I do with my idle SOL?" or "Which staking option is best?"</p>
                  )}
                  {chatMessages.map((m, i) => (
                    <div key={i} className={`text-xs p-2.5 rounded-lg ${m.role === "user" ? "bg-gray-800 text-white ml-8" : "bg-gray-900 text-gray-200 mr-8"}`}>
                      {m.role === "assistant" && <p className="text-purple-400 mb-1 font-medium">AI Advisor</p>}
                      {m.content}
                    </div>
                  ))}
                  {chatLoading && <div className="text-xs text-gray-500 mr-8 p-2.5 bg-gray-900 rounded-lg">Thinking...</div>}
                </div>
                <div className="flex gap-2 px-4 py-3 border-t border-gray-800">
                  <input
                    type="text"
                    placeholder="Ask anything about your portfolio..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && sendChat()}
                    className="flex-1 bg-gray-900 border border-gray-700 rounded px-3 py-1.5 text-xs outline-none focus:border-gray-500"
                  />
                  <button
                    onClick={sendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-white text-black px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </>
            )}
          </div>

          {(() => {
            const APY = 0.068;
            const KAMINO_APY = 0.055;
            const baseSOL = data.idleSOL > 0 ? data.idleSOL : data.solBalance;
            const kaminoBase = data.kaminoSOL;
            const hasKamino = kaminoBase > 0;

            const chartData = Array.from({ length: projectionYears + 1 }, (_, y) => ({
              year: y === 0 ? "Now" : `${y}yr`,
              sol: parseFloat((baseSOL * Math.pow(1 + APY, y)).toFixed(2)),
              usdVal: Math.round(baseSOL * Math.pow(1 + APY, y) * data.solPrice),
              ...(hasKamino && {
                kamino: parseFloat((kaminoBase * Math.pow(1 + KAMINO_APY, y)).toFixed(2)),
              }),
            }));
            const final = chartData[projectionYears];
            const gained = final.sol - baseSOL;
            const kaminoFinal = hasKamino ? parseFloat((kaminoBase * Math.pow(1 + KAMINO_APY, projectionYears)).toFixed(2)) : 0;
            const kaminoGained = kaminoFinal - kaminoBase;

            return (
              <div className="border border-yellow-700 bg-yellow-950 rounded p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-yellow-400 text-xs">
                    {data.idleSOL > 0 ? "Opportunity Cost — Staking Projection" : "Staking Projection — Total Portfolio"}
                  </p>
                  <div className="flex gap-1">
                    {[1, 3, 5].map((y) => (
                      <button
                        key={y}
                        onClick={() => setProjectionYears(y)}
                        className={`px-2 py-0.5 text-xs rounded ${projectionYears === y ? "bg-yellow-600 text-black font-bold" : "text-yellow-600 hover:text-yellow-400"}`}
                      >
                        {y}Y
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`grid gap-3 mb-4 ${hasKamino ? "grid-cols-2" : "grid-cols-1"}`}>
                  <div>
                    <p className="text-xs text-yellow-500 mb-0.5">{data.idleSOL > 0 ? "Idle SOL staked" : "Portfolio"} @ 6.8%</p>
                    <p className="text-xl font-bold text-yellow-300">{final.sol.toFixed(2)} SOL</p>
                    <p className="text-yellow-600 text-xs">${final.usdVal.toLocaleString()} · +{gained.toFixed(2)} SOL yield</p>
                  </div>
                  {hasKamino && (
                    <div>
                      <p className="text-xs text-blue-400 mb-0.5">Kamino ({kaminoBase.toFixed(2)} SOL) @ 5.5%</p>
                      <p className="text-xl font-bold text-blue-300">{kaminoFinal.toFixed(2)} SOL</p>
                      <p className="text-blue-600 text-xs">${Math.round(kaminoFinal * data.solPrice).toLocaleString()} · +{kaminoGained.toFixed(2)} SOL yield</p>
                    </div>
                  )}
                </div>

                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={chartData}>
                    <XAxis dataKey="year" tick={{ fill: "#a16207", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ background: "#1c1400", border: "1px solid #a16207", borderRadius: 6, fontSize: 12 }}
                      labelStyle={{ color: "#fbbf24" }}
                      formatter={(val: number, name: string) =>
                        name === "sol" ? [`${val} SOL`, "Staked"] :
                        name === "kamino" ? [`${val} SOL`, "Kamino"] :
                        [`$${val.toLocaleString()}`, "USD Value"]
                      }
                    />
                    <Line type="monotone" dataKey="sol" stroke="#fbbf24" strokeWidth={2} dot={{ fill: "#fbbf24", r: 3 }} />
                    {hasKamino && <Line type="monotone" dataKey="kamino" stroke="#60a5fa" strokeWidth={2} dot={{ fill: "#60a5fa", r: 3 }} />}
                    <Line type="monotone" dataKey="usdVal" stroke="#f97316" strokeWidth={1} strokeDasharray="4 2" dot={false} />
                  </LineChart>
                </ResponsiveContainer>

                <div className="flex gap-4 mt-2">
                  <span className="flex items-center gap-1 text-xs text-yellow-400"><span className="w-3 h-0.5 bg-yellow-400 inline-block" /> Staked SOL</span>
                  {hasKamino && <span className="flex items-center gap-1 text-xs text-blue-400"><span className="w-3 h-0.5 bg-blue-400 inline-block" /> Kamino</span>}
                  <span className="flex items-center gap-1 text-xs text-orange-400"><span className="w-3 h-0.5 bg-orange-400 inline-block" style={{borderTop: '2px dashed'}} /> USD value</span>
                </div>
              </div>
            );
          })()}

          {yields.length > 0 && (
            <div className="border border-gray-700 rounded p-4">
              <p className="text-gray-400 text-xs mb-3">Staking Yield Comparison — Live APY</p>
              <div className="space-y-2">
                {yields.map((y) => {
                  const riskColor = y.risk === "Very Low" ? "text-green-400" : y.risk === "Low" ? "text-green-500" : "text-yellow-400";
                  const isTop = y.apy === Math.max(...yields.map((y) => y.apy));
                  return (
                    <div key={y.symbol} className={`flex items-center justify-between text-sm p-2 rounded ${isTop ? "bg-gray-800" : ""}`}>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{y.label}</span>
                          {isTop && <span className="text-xs text-yellow-400">Best APY</span>}
                          {y.label === "Native Staking" ? (
                            <button
                              onClick={() => setStakeModalOpen(true)}
                              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                            >
                              ↗ Stake
                            </button>
                          ) : y.url && (
                            <a href={y.url} target="_blank" rel="noopener noreferrer" className="text-xs text-purple-400 hover:text-purple-300 transition-colors">↗ Stake</a>
                          )}
                        </div>
                        <div className="flex gap-3 mt-0.5">
                          <span className={`text-xs ${riskColor}`}>Risk: {y.risk}</span>
                          <span className="text-xs text-gray-500">Liquidity: {y.liquidity}</span>
                          {y.tvlUsd && <span className="text-xs text-gray-500">TVL: ${(y.tvlUsd / 1e9).toFixed(1)}B</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-green-400">{y.apy}%</p>
                        {data && data.idleSOL > 0 && (
                          <p className="text-xs text-gray-500">+{(data.idleSOL * y.apy / 100).toFixed(2)} SOL/yr</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="border border-gray-700 rounded p-4">
            <p className="text-gray-400 text-xs mb-3">Tokens ({data.tokens.length})</p>
            {data.tokens.length === 0 ? (
              <p className="text-gray-500 text-sm">No tokens found</p>
            ) : (
              <>
                <ul className="space-y-2">
                  {(showAllTokens ? data.tokens : data.tokens.slice(0, 5)).map((t) => (
                    <li key={t.mint} className="flex justify-between text-sm">
                      <div className="flex flex-col">
                        <span>{t.name ?? "Unknown Token"}</span>
                        <span className="text-gray-500 text-xs">{t.symbol ?? t.mint.slice(0, 8) + "..."}</span>
                      </div>
                      <span>{(t.amount / Math.pow(10, t.decimals)).toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
                {data.tokens.length > 5 && (
                  <button
                    onClick={() => setShowAllTokens(!showAllTokens)}
                    className="mt-3 text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    {showAllTokens ? "Show less" : `Show all ${data.tokens.length} tokens`}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {stakeModalOpen && data && (
        <NativeStakeModal
          onClose={() => setStakeModalOpen(false)}
          maxSOL={data.solBalance}
        />
      )}
    </main>
  );
}
