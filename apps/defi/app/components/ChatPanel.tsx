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
  onSend?: (input: string, messages: ChatMessage[]) => Promise<ChatMessage>;
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

export default function ChatPanel({
  context = "",
  placeholder = "Ask about your portfolio…",
  onSend,
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
    setOpen(true);
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

  const isActive = open && hasThread;

  return (
    <div
      className={`shrink-0 transition-colors ${isActive ? "border-t border-white/[0.06] backdrop-blur-xl" : ""}`}
      style={{ background: isActive ? "rgba(8,6,18,0.70)" : "transparent" }}
    >
      {/* Thread — only when open and has messages */}
      {open && hasThread && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
            <span className="text-xs font-semibold text-purple-400">✦ AI</span>
            <div className="flex items-center gap-4">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-xs text-gray-700 hover:text-gray-500 transition-colors"
                >
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

          {/* Message thread */}
          <div
            ref={threadRef}
            className="overflow-y-auto px-4 py-3 space-y-3"
            style={{ maxHeight: 220 }}
          >
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] text-xs px-3 py-2.5 rounded-xl leading-relaxed ${
                  m.role === "user" ? "bg-gray-800 text-white" : "text-gray-300"
                }`}>
                  {m.content}
                  {m.role === "assistant" && (
                    <span className="inline-flex ml-1.5 align-middle" style={{ verticalAlign: "middle" }}>
                      <AIIcon color={m.color ?? "#a855f7"} size={14} />
                    </span>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="px-3 py-3.5 flex items-center gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block"
                      style={{ animation: `typing-dot 1.2s ease-in-out ${i * 0.18}s infinite` }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Chip input — always visible */}
      <div className="px-4 py-3">
        <div className={`flex items-center border rounded-full pl-4 pr-1.5 py-1.5 transition-all ${
          focused ? "border-purple-600" : "border-purple-600/55"
        }`}>
          <span className={`text-xs shrink-0 mr-3 transition-colors ${focused ? "text-purple-400" : "text-purple-500"}`}>
            ✦
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => { setFocused(true); if (hasThread) setOpen(true); }}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={placeholder}
            className={`flex-1 bg-transparent text-sm outline-none min-w-0 transition-colors ${
              focused ? "text-white placeholder-gray-600" : "text-gray-400 placeholder-gray-600"
            }`}
          />
          {hasThread && !open && !focused ? (
            <button
              onClick={() => setOpen(true)}
              className="text-xs text-purple-500 hover:text-purple-400 transition-colors px-3 py-2"
            >
              Show ↑
            </button>
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
    </div>
  );
}
