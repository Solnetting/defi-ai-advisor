"use client";

import { useState, useRef, useEffect } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  context?: string;
  placeholder?: string;
}

export default function FreeformChip({ context = "", placeholder = "Ask about your portfolio…" }: Props) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(true);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  async function send() {
    const q = input.trim();
    if (!q || loading) return;
    const next: Message[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      const { reply } = await res.json();
      setMessages([...next, { role: "assistant", content: reply }]);
    } catch {
      setMessages([...next, { role: "assistant", content: "Something went wrong. Try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const showThread = messages.length > 0 || loading;

  if (!open) {
    return (
      <div className="shrink-0 border-t border-gray-900 bg-black px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 text-xs text-gray-700 hover:text-purple-400 transition-colors"
        >
          <span>✦</span>
          <span>Ask AI</span>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-white/5 backdrop-blur-xl" style={{ background: "rgba(10,10,20,0.75)" }}>
      {/* Thread — slides up from chip when messages exist */}
      {showThread && (
        <div ref={threadRef} className="px-4 pt-3 pb-2 space-y-2.5 max-h-64 overflow-y-auto">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-purple-400">✦ AI</span>
            <button onClick={() => setMessages([])} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">
              Clear
            </button>
          </div>
          {messages.map((m, i) => (
            <div key={i} className={`flex items-end gap-2 ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              {m.role === "assistant" && (
                <div className="shrink-0 w-6 h-6 rounded-full border border-purple-700/60 flex items-center justify-center mb-0.5">
                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                    <polyline points="0,7 2.5,4 5,5.5 7.5,1.5 10,0.5" stroke="#a855f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
              )}
              <div className={`max-w-[80%] text-xs px-3 py-2.5 rounded-xl leading-relaxed ${
                m.role === "user" ? "bg-gray-800 text-white" : "bg-gray-900 text-gray-300"
              }`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="shrink-0 w-6 h-6 rounded-full border border-purple-700/60 flex items-center justify-center mb-0.5">
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <polyline points="0,7 2.5,4 5,5.5 7.5,1.5 10,0.5" stroke="#a855f7" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <div className="bg-gray-900 px-3 py-3 rounded-xl flex items-center gap-1.5">
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
      )}

      {/* Chip input */}
      <div className="px-4 py-3">
        <div className={`flex items-center gap-3 border rounded-full px-4 py-2.5 transition-all ${
          focused ? "border-purple-700" : "border-purple-700/50"
        }`}>
          <span className={`text-xs shrink-0 transition-colors ${focused ? "text-purple-400" : "text-gray-600"}`}>✦</span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={placeholder}
            className={`flex-1 bg-transparent text-sm outline-none min-w-0 transition-colors ${
              focused ? "text-white placeholder-gray-600" : "text-gray-500 placeholder-gray-600"
            }`}
          />
          {focused ? (
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              className="shrink-0 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-all"
            >
              {loading ? "…" : "Ask"}
            </button>
          ) : (
            <button
              onClick={() => setOpen(false)}
              className="shrink-0 text-gray-700 hover:text-gray-500 transition-colors text-sm leading-none"
              aria-label="Close"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
