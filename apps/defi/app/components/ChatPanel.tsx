"use client";

import { useState, useRef, useEffect } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  color?: string;
}

interface Props {
  context?: string;
  placeholder?: string;
  /**
   * Custom send handler. Receives the user input and full message history.
   * Must return the assistant reply (with optional color for chart-linked responses).
   * Defaults to /api/chat.
   */
  onSend?: (input: string, messages: ChatMessage[]) => Promise<ChatMessage>;
  /**
   * overlay — absolute glass panel that floats above content (Home).
   * inline  — in-flow panel that sits above the bottom nav (Portfolio / Explore).
   */
  mode?: "overlay" | "inline";
  /** px from bottom of container, only used in overlay mode. */
  bottomOffset?: number;
}

function AIIcon({ color = "#a855f7", size = 14 }: { color?: string; size?: number }) {
  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0"
      style={{ width: size, height: size, border: `1px solid ${color}60` }}
    >
      <svg width={size * 0.65} height={size * 0.55} viewBox="0 0 9 7" fill="none">
        <polyline points="0,6.5 2,4 4.5,5.5 7,1.5 9,0.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

const GLASS_BG = "rgba(8,6,18,0.85)";
const GLASS_BLUR = "backdrop-blur-xl";

export default function ChatPanel({
  context = "",
  placeholder = "Ask about your portfolio…",
  onSend,
  mode = "inline",
  bottomOffset = 116,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    if (mode === "overlay") setOpen(true);
    try {
      let reply: ChatMessage;
      if (onSend) {
        reply = await onSend(q, next);
      } else {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next, context }),
        });
        const json = await res.json();
        reply = { role: "assistant", content: json.reply ?? "Something went wrong." };
      }
      setMessages([...next, reply]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const hasThread = messages.length > 0 || loading;

  // ── Shared panel header ───────────────────────────────────────────────────
  const headerUI = (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800 shrink-0">
      <span className="text-xs font-semibold text-purple-400">✦ AI</span>
      <div className="flex items-center gap-4">
        {messages.length > 0 && (
          <button onClick={() => setMessages([])} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">
            Clear
          </button>
        )}
        <button
          onClick={() => setOpen(false)}
          className="text-gray-600 hover:text-gray-300 transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>
    </div>
  );

  // ── Shared chip input ─────────────────────────────────────────────────────
  const chipUI = (
    <div className="px-4 py-3 shrink-0">
      <div className={`flex items-center border rounded-full pl-4 pr-1.5 py-1.5 transition-all ${
        focused ? "border-purple-700" : "border-purple-700/40"
      }`}>
        <span className={`text-xs shrink-0 mr-3 transition-colors ${focused ? "text-purple-400" : "text-purple-700"}`}>✦</span>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => { setFocused(true); if (mode === "overlay" && hasThread) setOpen(true); }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder={placeholder}
          className={`flex-1 bg-transparent text-sm outline-none min-w-0 transition-colors ${
            focused ? "text-white placeholder-gray-700" : "text-gray-600 placeholder-gray-700"
          }`}
        />
        {mode === "overlay" && hasThread && !open && !focused ? (
          <button onClick={() => setOpen(true)} className="text-xs text-purple-500 hover:text-purple-400 transition-colors px-3 py-2">Show ↑</button>
        ) : (
          <button
            onMouseDown={(e) => { e.preventDefault(); send(); }}
            disabled={!input.trim() || loading}
            className="shrink-0 ml-2 bg-purple-700 hover:bg-purple-600 disabled:opacity-25 text-white text-xs font-semibold px-4 py-2.5 rounded-full transition-all"
          >
            {loading ? "…" : "Ask"}
          </button>
        )}
      </div>
    </div>
  );

  // ── Thread content (shared) ──────────────────────────────────────────────
  const threadContent = (maxH: number) => (
    <div ref={threadRef} className="overflow-y-auto px-4 py-3 space-y-3" style={{ maxHeight: maxH }}>
      {messages.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] text-xs px-3 py-2.5 rounded-xl leading-relaxed ${
            m.role === "user" ? "bg-gray-800 text-white" : "text-gray-300"
          }`}>
            {m.content}
            {m.role === "assistant" && m.color && (
              <span className="inline-flex ml-1.5 align-middle" style={{ verticalAlign: "middle" }}>
                <AIIcon color={m.color} size={14} />
              </span>
            )}
          </div>
        </div>
      ))}
      {loading && (
        <div className="flex justify-start">
          <div className="text-gray-600 text-xs px-3 py-2.5">Thinking…</div>
        </div>
      )}
    </div>
  );

  // ── OVERLAY mode (Home) ───────────────────────────────────────────────────
  if (mode === "overlay") {
    return (
      <>
        {open && hasThread && (
          <div
            className={`absolute left-0 right-0 z-20 border-t border-gray-800 ${GLASS_BLUR}`}
            style={{ bottom: bottomOffset, background: GLASS_BG }}
          >
            {headerUI}
            {threadContent(220)}
          </div>
        )}
        <div className="shrink-0 bg-black">
          {chipUI}
        </div>
      </>
    );
  }

  // ── INLINE mode (Portfolio / Explore) ─────────────────────────────────────
  if (!open) {
    return (
      <div className="shrink-0 border-t border-gray-800 bg-black px-4 py-3">
        <button onClick={() => setOpen(true)} className="flex items-center gap-2 text-xs text-gray-700 hover:text-purple-400 transition-colors">
          <span>✦</span>
          <span>Ask AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className={`shrink-0 border-t border-gray-800 ${GLASS_BLUR}`} style={{ background: GLASS_BG }}>
      {hasThread && (
        <>
          {headerUI}
          {threadContent(220)}
        </>
      )}
      {chipUI}
    </div>
  );
}
