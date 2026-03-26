"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { C } from "@/lib/sial-data";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const inp = {
    background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
    padding: "10px 14px", color: C.text, fontSize: 14, width: "100%" as const,
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await signIn("credentials", { email, password, redirect: false });
    if (res?.ok) {
      router.push("/");
    } else {
      setError("Email ou mot de passe incorrect");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: C.bg }}>
      <div style={{ width: 360, padding: 32, background: C.s1, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>
            <span style={{ color: C.orange }}>SIAL</span>
            <span style={{ color: C.sec, margin: "0 8px", fontWeight: 300 }}>+</span>
            <span style={{ color: C.teal }}>ISULA</span>
          </div>
          <div style={{ fontSize: 12, color: C.sec }}>Planning Industriel — Groupe VISTA</div>
        </div>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Email</label>
            <input type="email" style={inp} value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 10, color: C.sec, display: "block", marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Mot de passe</label>
            <input type="password" style={inp} value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div style={{ marginBottom: 12, padding: "8px 12px", background: C.red + "22", border: `1px solid ${C.red}44`, borderRadius: 4, fontSize: 12, color: C.red }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ width: "100%", padding: "11px 0", background: C.orange, border: "none", borderRadius: 5, color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", letterSpacing: "0.04em" }}>
            {loading ? "Connexion..." : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
