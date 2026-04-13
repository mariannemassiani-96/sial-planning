/* eslint-disable react/no-unescaped-entities */
"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";
import { useIsMobile } from "@/lib/useIsMobile";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  action?: string;
  timestamp: Date;
}

// ── Dictée vocale (Web Speech API) ──────────────────────────────────────────

function useSpeechRecognition() {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<any>(null);

  const start = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new SR();
    recognition.lang = "fr-FR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognition.onresult = (event: any) => {
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        }
      }
      if (final) setTranscript(final);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const supported = typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return { listening, transcript, start, stop, supported, setTranscript };
}

// ── Composant principal ─────────────────────────────────────────────────────

export default function AssistantIA() {
  const mobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [memos, setMemos] = useState<any[]>([]);
  const [showMemos, setShowMemos] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { listening, transcript, start, stop, supported, setTranscript } = useSpeechRecognition();

  // Quand la dictée produit du texte, le mettre dans l'input
  useEffect(() => {
    if (transcript) {
      setInput(transcript);
      setTranscript("");
    }
  }, [transcript, setTranscript]);

  // Scroll vers le bas à chaque nouveau message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Focus input à l'ouverture
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);

  // Charger les mémos
  const loadMemos = useCallback(async () => {
    try {
      const res = await fetch("/api/memos?statut=ouvert");
      if (res.ok) setMemos(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    if (open) loadMemos();
  }, [open, loadMemos]);

  const send = async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    const userMsg: Message = {
      id: `u_${Date.now()}`,
      role: "user",
      text: msg,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();

      const assistantMsg: Message = {
        id: `a_${Date.now()}`,
        role: "assistant",
        text: data.message || data.error || "Erreur",
        action: data.action,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);

      // Recharger les mémos si une tâche a été créée
      if (data.action === "tache_creee") loadMemos();
    } catch {
      setMessages(prev => [...prev, {
        id: `e_${Date.now()}`,
        role: "assistant",
        text: "Erreur de connexion. Reessayez.",
        timestamp: new Date(),
      }]);
    }
    setSending(false);
  };

  const markDone = async (id: string) => {
    try {
      await fetch("/api/memos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, statut: "fait" }),
      });
      setMemos(prev => prev.filter(m => m.id !== id));
    } catch {}
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: "fixed", bottom: mobile ? 74 : 20, right: mobile ? 12 : 20, zIndex: 9999,
          width: mobile ? 48 : 56, height: mobile ? 48 : 56, borderRadius: "50%",
          background: `linear-gradient(135deg, ${C.orange}, ${C.red})`,
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          fontSize: 24, color: "#fff",
          transition: "transform 0.2s",
        }}
        onMouseEnter={e => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={e => (e.currentTarget.style.transform = "scale(1)")}
        title="Assistant IA"
      >
        🤖
      </button>
    );
  }

  return (
    <div style={{
      position: "fixed", zIndex: 9999,
      bottom: mobile ? 64 : 20, right: mobile ? 0 : 20,
      width: mobile ? "100%" : 380,
      height: mobile ? "calc(100vh - 64px)" : 520,
      borderRadius: mobile ? 0 : 16,
      background: C.s1, border: mobile ? "none" : `1px solid ${C.border}`,
      display: "flex", flexDirection: "column",
      boxShadow: mobile ? "none" : "0 8px 40px rgba(0,0,0,0.5)",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        padding: "12px 16px",
        background: `linear-gradient(135deg, ${C.orange}22, ${C.red}22)`,
        borderBottom: `1px solid ${C.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <span style={{ fontSize: 14, fontWeight: 700 }}>🤖 Assistant IA</span>
          <span style={{ fontSize: 10, color: C.sec, marginLeft: 8 }}>Dictez ou tapez</span>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            onClick={() => setShowMemos(!showMemos)}
            style={{
              padding: "3px 8px", background: "none",
              border: `1px solid ${memos.length > 0 ? C.orange : C.border}`,
              borderRadius: 4, color: memos.length > 0 ? C.orange : C.sec,
              cursor: "pointer", fontSize: 10, fontWeight: 600,
            }}
          >
            {memos.length > 0 ? `${memos.length} tache${memos.length > 1 ? "s" : ""}` : "Taches"}
          </button>
          <button onClick={() => setOpen(false)} style={{
            background: "none", border: "none", color: C.sec, cursor: "pointer", fontSize: 18, padding: "0 4px",
          }}>×</button>
        </div>
      </div>

      {/* Mémos panel */}
      {showMemos && (
        <div style={{
          padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
          maxHeight: 160, overflowY: "auto", background: C.bg,
        }}>
          {memos.length === 0 ? (
            <div style={{ fontSize: 11, color: C.muted, padding: 8, textAlign: "center" }}>
              Aucune tache en cours
            </div>
          ) : (
            memos.map(m => (
              <div key={m.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "4px 0", borderBottom: `1px solid ${C.border}22`,
              }}>
                <div style={{ flex: 1 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 600,
                    color: m.priorite === "urgente" ? C.orange : m.priorite === "critique" ? C.red : C.text,
                  }}>
                    {m.priorite !== "normale" ? "⚡ " : ""}{m.texte}
                  </span>
                  {m.poste && <span style={{ fontSize: 9, color: C.muted, marginLeft: 6 }}>{m.poste}</span>}
                </div>
                <button
                  onClick={() => markDone(m.id)}
                  style={{
                    padding: "2px 6px", background: C.green + "22",
                    border: `1px solid ${C.green}`, borderRadius: 3,
                    color: C.green, cursor: "pointer", fontSize: 9, fontWeight: 700,
                  }}
                >
                  Fait
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 12px 8px",
      }}>
        {messages.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 16px", color: C.sec }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🤖</div>
            <div style={{ fontSize: 12, marginBottom: 16 }}>
              Dites ou tapez ce dont vous avez besoin
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, textAlign: "left" }}>
              {[
                "Faut changer la lame de la double tete",
                "C'est quoi la charge cette semaine ?",
                "Urgent : commander les joints PVC",
                "Attention verifier la soudure lot 45",
              ].map(ex => (
                <button key={ex} onClick={() => send(ex)} style={{
                  padding: "6px 10px", background: C.bg, border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.sec, cursor: "pointer", fontSize: 11,
                  textAlign: "left",
                }}>
                  "{ex}"
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{
            display: "flex", justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
            marginBottom: 8,
          }}>
            <div style={{
              maxWidth: "85%", padding: "8px 12px", borderRadius: 12,
              background: msg.role === "user" ? C.orange + "22" : C.bg,
              border: `1px solid ${msg.role === "user" ? C.orange + "44" : C.border}`,
              fontSize: 12, lineHeight: 1.5, color: C.text,
              whiteSpace: "pre-wrap",
            }}>
              {msg.text.split("\n").map((line, i) => {
                // Bold markdown
                const parts = line.split(/\*\*(.*?)\*\*/g);
                return (
                  <div key={i}>
                    {parts.map((part, j) =>
                      j % 2 === 1 ? <b key={j}>{part}</b> : <span key={j}>{part}</span>
                    )}
                  </div>
                );
              })}
              {msg.action === "tache_creee" && (
                <div style={{ marginTop: 4, fontSize: 9, color: C.green, fontWeight: 600 }}>
                  ✓ Enregistre
                </div>
              )}
            </div>
          </div>
        ))}

        {sending && (
          <div style={{ display: "flex", justifyContent: "flex-start", marginBottom: 8 }}>
            <div style={{
              padding: "8px 12px", borderRadius: 12, background: C.bg,
              border: `1px solid ${C.border}`, fontSize: 12, color: C.muted,
            }}>
              ⏳ Reflexion...
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div style={{
        padding: "8px 12px", borderTop: `1px solid ${C.border}`,
        display: "flex", gap: 6, alignItems: "center",
        background: C.s1,
      }}>
        {supported && (
          <button
            onClick={listening ? stop : start}
            style={{
              width: 36, height: 36, borderRadius: "50%",
              background: listening ? C.red + "33" : C.bg,
              border: `2px solid ${listening ? C.red : C.border}`,
              color: listening ? C.red : C.sec,
              cursor: "pointer", fontSize: 16,
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: listening ? "pulse 1.5s infinite" : "none",
            }}
            title={listening ? "Arreter la dictee" : "Dicter (micro)"}
          >
            🎙
          </button>
        )}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder={listening ? "Parlez maintenant..." : "Tapez ou dictez..."}
          style={{
            flex: 1, padding: "8px 12px", background: C.bg,
            border: `1px solid ${listening ? C.red : C.border}`,
            borderRadius: 8, color: C.text, fontSize: 13, outline: "none",
          }}
        />
        <button
          onClick={() => send()}
          disabled={sending || !input.trim()}
          style={{
            padding: "8px 14px", background: C.orange, border: "none",
            borderRadius: 8, color: "#000", fontWeight: 700, cursor: "pointer",
            fontSize: 13, opacity: sending || !input.trim() ? 0.4 : 1,
          }}
        >
          →
        </button>
      </div>

      {/* Pulse animation for mic */}
      <style>{`
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(239, 83, 80, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(239, 83, 80, 0); }
          100% { box-shadow: 0 0 0 0 rgba(239, 83, 80, 0); }
        }
      `}</style>
    </div>
  );
}
