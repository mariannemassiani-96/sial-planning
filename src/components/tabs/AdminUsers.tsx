"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

interface User {
  id: string;
  email: string;
  nom: string;
  role: string;
  createdAt: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [editData, setEditData] = useState({ email: "", nom: "", role: "", password: "" });
  const [newUser, setNewUser] = useState({ email: "", nom: "", role: "OPERATEUR", password: "" });
  const [showNew, setShowNew] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const showMsg = (text: string, ok: boolean) => { setMsg({ text, ok }); setTimeout(() => setMsg(null), 3000); };

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) setUsers(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    if (!newUser.email || !newUser.password) { showMsg("Email et mot de passe requis", false); return; }
    const res = await fetch("/api/admin/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newUser),
    });
    if (res.ok) { showMsg("Utilisateur créé", true); setNewUser({ email: "", nom: "", role: "OPERATEUR", password: "" }); setShowNew(false); load(); }
    else { const d = await res.json(); showMsg(d.error || "Erreur", false); }
  };

  const updateUser = async (id: string) => {
    const body: Record<string, string> = {};
    if (editData.email) body.email = editData.email;
    if (editData.nom) body.nom = editData.nom;
    if (editData.role) body.role = editData.role;
    if (editData.password) body.password = editData.password;
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) { showMsg("Modifié", true); setEditId(null); load(); }
    else { showMsg("Erreur", false); }
  };

  const deleteUser = async (id: string, nom: string) => {
    if (!confirm(`Supprimer ${nom} ?`)) return;
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    if (res.ok) { showMsg("Supprimé", true); load(); }
    else { const d = await res.json(); showMsg(d.error || "Erreur", false); }
  };

  const inp = { padding: "5px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 12, outline: "none" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800 }}>Administration utilisateurs</div>
        <button onClick={() => setShowNew(!showNew)} style={{ padding: "6px 16px", background: C.orange, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
          + Nouvel utilisateur
        </button>
        {msg && <span style={{ fontSize: 11, color: msg.ok ? C.green : C.red, fontWeight: 600 }}>{msg.text}</span>}
      </div>

      {/* Formulaire création */}
      {showNew && (
        <div style={{ background: C.s1, border: `1px solid ${C.orange}`, borderRadius: 6, padding: "12px 16px", marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: C.orange }}>Nouvel utilisateur</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="Email" style={{ ...inp, width: 220 }} />
            <input value={newUser.nom} onChange={e => setNewUser(p => ({ ...p, nom: e.target.value }))} placeholder="Nom" style={{ ...inp, width: 150 }} />
            <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))} style={inp}>
              <option value="OPERATEUR">Opérateur</option>
              <option value="ADMIN">Admin</option>
            </select>
            <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Mot de passe" style={{ ...inp, width: 160 }} />
            <button onClick={createUser} style={{ padding: "5px 16px", background: C.green, border: "none", borderRadius: 4, color: "#000", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Créer</button>
            <button onClick={() => setShowNew(false)} style={{ padding: "5px 12px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 4, color: C.sec, fontSize: 11, cursor: "pointer" }}>Annuler</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ padding: 40, textAlign: "center", color: C.sec }}>Chargement...</div> : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>NOM</th>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "left" }}>EMAIL</th>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", width: 100 }}>RÔLE</th>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", width: 100 }}>CRÉÉ LE</th>
              <th style={{ padding: "8px 10px", background: C.s2, border: `1px solid ${C.border}`, textAlign: "center", width: 200 }}>ACTIONS</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => {
              const isEditing = editId === u.id;
              return (
                <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                  <td style={{ padding: "6px 10px", border: `1px solid ${C.border}` }}>
                    {isEditing ? <input value={editData.nom} onChange={e => setEditData(p => ({ ...p, nom: e.target.value }))} style={{ ...inp, width: 140 }} /> : <span style={{ fontWeight: 700 }}>{u.nom}</span>}
                  </td>
                  <td style={{ padding: "6px 10px", border: `1px solid ${C.border}` }}>
                    {isEditing ? <input value={editData.email} onChange={e => setEditData(p => ({ ...p, email: e.target.value }))} style={{ ...inp, width: 200 }} /> : u.email}
                  </td>
                  <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    {isEditing ? (
                      <select value={editData.role} onChange={e => setEditData(p => ({ ...p, role: e.target.value }))} style={inp}>
                        <option value="OPERATEUR">Opérateur</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    ) : (
                      <span style={{ padding: "2px 8px", borderRadius: 3, fontSize: 10, fontWeight: 700, background: u.role === "ADMIN" ? C.orange + "22" : C.s2, color: u.role === "ADMIN" ? C.orange : C.sec }}>{u.role}</span>
                    )}
                  </td>
                  <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "center", fontSize: 10, color: C.muted }}>
                    {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                  </td>
                  <td style={{ padding: "6px 10px", border: `1px solid ${C.border}`, textAlign: "center" }}>
                    {isEditing ? (
                      <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                        <input type="password" value={editData.password} onChange={e => setEditData(p => ({ ...p, password: e.target.value }))} placeholder="Nouveau mdp (vide = inchangé)" style={{ ...inp, width: 160, fontSize: 10 }} />
                        <button onClick={() => updateUser(u.id)} style={{ padding: "3px 10px", background: C.green, border: "none", borderRadius: 3, color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>Sauver</button>
                        <button onClick={() => setEditId(null)} style={{ padding: "3px 8px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, fontSize: 10, cursor: "pointer" }}>Annuler</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
                        <button onClick={() => { setEditId(u.id); setEditData({ email: u.email, nom: u.nom, role: u.role, password: "" }); }} style={{ padding: "3px 10px", background: C.s2, border: `1px solid ${C.border}`, borderRadius: 3, color: C.sec, fontSize: 10, cursor: "pointer" }}>Modifier</button>
                        <button onClick={() => deleteUser(u.id, u.nom)} style={{ padding: "3px 10px", background: C.red + "22", border: `1px solid ${C.red}44`, borderRadius: 3, color: C.red, fontSize: 10, cursor: "pointer" }}>Supprimer</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
