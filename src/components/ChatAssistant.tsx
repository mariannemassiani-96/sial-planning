"use client";
import { useState, useRef, useEffect } from "react";
import { C, CommandeCC } from "@/lib/sial-data";

interface Message {
  role: "user" | "assistant";
  text: string;
}

export default function ChatAssistant({ commandes: _commandes }: { commandes: CommandeCC[] }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Bonjour ! Je suis l'assistant SIAL. Posez-moi une question sur vos commandes, le planning, ou comment utiliser l'application." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.answer || "Désolé, je n'ai pas compris." }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", text: "Erreur de connexion. Réessayez." }]);
    }
    setLoading(false);
  };

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: "fixed", bottom: 20, right: 20, zIndex: 8000,
          width: 50, height: 50, borderRadius: "50%",
          background: open ? C.red : C.orange,
          border: "none", cursor: "pointer",
          fontSize: 22, color: "#000", fontWeight: 800,
          boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        {open ? "✕" : "💬"}
      </button>

      {/* Fenêtre chat */}
      {open && (
        <div style={{
          position: "fixed", bottom: 80, right: 20, zIndex: 8000,
          width: 380, height: 500, maxHeight: "70vh",
          background: C.s1, border: `1px solid ${C.border}`, borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}>
          {/* Header */}
          <div style={{ padding: "12px 16px", background: C.orange, color: "#000", fontWeight: 800, fontSize: 14 }}>
            Assistant SIAL
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
            {messages.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "85%",
                padding: "8px 12px",
                borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: m.role === "user" ? C.orange + "22" : C.s2,
                border: `1px solid ${m.role === "user" ? C.orange + "44" : C.border}`,
                fontSize: 12, lineHeight: 1.5, color: C.text,
                whiteSpace: "pre-wrap",
              }}>
                {m.text.split("**").map((part, j) =>
                  j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>
                )}
              </div>
            ))}
            {loading && (
              <div style={{ alignSelf: "flex-start", padding: "8px 12px", background: C.s2, borderRadius: "12px 12px 12px 2px", fontSize: 12, color: C.muted }}>
                ...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: "10px 12px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 6 }}>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Posez votre question..."
              style={{
                flex: 1, padding: "8px 12px", background: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 8, color: C.text, fontSize: 12, outline: "none",
              }}
            />
            <button onClick={send} disabled={loading}
              style={{ padding: "8px 14px", background: C.orange, border: "none", borderRadius: 8, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  );
}
