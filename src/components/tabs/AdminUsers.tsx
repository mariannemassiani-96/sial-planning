"use client";
import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/sial-data";

// ── Onglets disponibles avec leurs droits possibles ─────────────────────────
const ALL_TABS = [
  { id: "dashboard_matin", label: "Matin" },
  { id: "planning_fab",    label: "Planning" },
  { id: "dashboard",       label: "Suivi" },
  { id: "livraison",       label: "Livraisons" },
  { id: "chargements",     label: "Chargements" },
  { id: "saisie",          label: "Commande" },
  { id: "carnet",          label: "Commandes" },
  { id: "rh",              label: "Equipe" },
  { id: "pointage",        label: "Pointage" },
  { id: "affichage_atelier", label: "Atelier" },
  { id: "isula",           label: "ISULA" },
  { id: "qualite",         label: "Qualite" },
  { id: "stocks",          label: "Stocks" },
  { id: "referentiel",     label: "Referentiel" },
  { id: "import_csv",      label: "Import" },
  { id: "stats_admin",     label: "Stats" },
];

const DROITS = [
  { id: "creer_commande",    label: "Creer des commandes" },
  { id: "modifier_commande", label: "Modifier des commandes" },
  { id: "supprimer_commande", label: "Supprimer des commandes" },
  { id: "modifier_planning", label: "Modifier le planning" },
  { id: "valider_semaine",   label: "Valider une semaine" },
  { id: "modifier_competences", label: "Modifier les competences" },
  { id: "modifier_pointage", label: "Saisir le pointage" },
  { id: "modifier_stocks",   label: "Modifier les stocks" },
  { id: "gerer_referentiel", label: "Modifier le referentiel" },
  { id: "importer_csv",      label: "Importer des fichiers" },
];

interface UserData {
  id: string;
  email: string;
  nom: string;
  role: string;
  permissions: {
    tabs?: string[];
    droits?: string[];
  } | null;
  createdAt: string;
}

interface EditForm {
  id?: string;
  nom: string;
  email: string;
  password: string;
  role: string;
  tabs: string[];
  droits: string[];
}

const defaultForm = (): EditForm => ({
  nom: "",
  email: "",
  password: "",
  role: "OPERATEUR",
  tabs: ALL_TABS.map(t => t.id),
  droits: ["modifier_pointage"],
});

export default function AdminUsers() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editUser, setEditUser] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) throw new Error("Erreur chargement");
      setUsers(await res.json());
      setError("");
    } catch {
      setError("Impossible de charger les utilisateurs");
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const openNew = () => setEditUser(defaultForm());

  const openEdit = (u: UserData) => {
    const perms = u.permissions || {};
    setEditUser({
      id: u.id,
      nom: u.nom,
      email: u.email,
      password: "",
      role: u.role,
      tabs: perms.tabs || ALL_TABS.map(t => t.id),
      droits: perms.droits || (u.role === "ADMIN" ? DROITS.map(d => d.id) : ["modifier_pointage"]),
    });
  };

  const save = async () => {
    if (!editUser) return;
    setSaving(true);
    setError("");
    try {
      const permissions = { tabs: editUser.tabs, droits: editUser.droits };
      const body: Record<string, unknown> = {
        nom: editUser.nom,
        email: editUser.email,
        role: editUser.role,
        permissions,
      };
      if (editUser.id) body.id = editUser.id;
      if (editUser.password) body.password = editUser.password;
      else if (!editUser.id) { setError("Mot de passe obligatoire"); setSaving(false); return; }

      const res = await fetch("/api/admin/users", {
        method: editUser.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur serveur");
      }
      setEditUser(null);
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  const deleteUser = async (id: string) => {
    try {
      const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erreur");
      }
      setConfirmDelete(null);
      fetchUsers();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleTab = (tabId: string) => {
    if (!editUser) return;
    setEditUser(prev => {
      if (!prev) return prev;
      const tabs = prev.tabs.includes(tabId)
        ? prev.tabs.filter(t => t !== tabId)
        : [...prev.tabs, tabId];
      return { ...prev, tabs };
    });
  };

  const toggleDroit = (droitId: string) => {
    if (!editUser) return;
    setEditUser(prev => {
      if (!prev) return prev;
      const droits = prev.droits.includes(droitId)
        ? prev.droits.filter(d => d !== droitId)
        : [...prev.droits, droitId];
      return { ...prev, droits };
    });
  };

  const selectAllTabs = () => {
    if (!editUser) return;
    setEditUser(prev => prev ? { ...prev, tabs: ALL_TABS.map(t => t.id) } : prev);
  };

  const selectNoTabs = () => {
    if (!editUser) return;
    setEditUser(prev => prev ? { ...prev, tabs: [] } : prev);
  };

  const selectAllDroits = () => {
    if (!editUser) return;
    setEditUser(prev => prev ? { ...prev, droits: DROITS.map(d => d.id) } : prev);
  };

  const selectNoDroits = () => {
    if (!editUser) return;
    setEditUser(prev => prev ? { ...prev, droits: [] } : prev);
  };

  if (loading) return <div style={{ color: C.sec, textAlign: "center", padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Administration utilisateurs</h2>
        <button onClick={openNew} style={{
          padding: "8px 16px", background: C.green, color: "#000", border: "none",
          borderRadius: 6, fontWeight: 700, cursor: "pointer", fontSize: 13,
        }}>
          + Nouvel utilisateur
        </button>
      </div>

      {error && (
        <div style={{ background: "rgba(239,68,68,0.15)", border: `1px solid ${C.red}`, borderRadius: 6, padding: "8px 12px", marginBottom: 12, color: C.red, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ── Tableau des utilisateurs ────────────────────────────── */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${C.border}` }}>
            <th style={{ textAlign: "left", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>NOM</th>
            <th style={{ textAlign: "left", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>EMAIL</th>
            <th style={{ textAlign: "center", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>ROLE</th>
            <th style={{ textAlign: "center", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>ONGLETS</th>
            <th style={{ textAlign: "center", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>DROITS</th>
            <th style={{ textAlign: "center", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>CREE LE</th>
            <th style={{ textAlign: "right", padding: "8px 12px", color: C.sec, fontWeight: 600 }}>ACTIONS</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => {
            const perms = u.permissions || {};
            const nbTabs = perms.tabs ? perms.tabs.length : ALL_TABS.length;
            const nbDroits = perms.droits ? perms.droits.length : (u.role === "ADMIN" ? DROITS.length : 1);
            return (
              <tr key={u.id} style={{ borderBottom: `1px solid ${C.border}` }}>
                <td style={{ padding: "10px 12px", fontWeight: 600 }}>{u.nom}</td>
                <td style={{ padding: "10px 12px", color: C.sec }}>{u.email}</td>
                <td style={{ padding: "10px 12px", textAlign: "center" }}>
                  <span style={{
                    padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                    background: u.role === "ADMIN" ? C.orange : C.blue,
                    color: "#fff",
                  }}>
                    {u.role}
                  </span>
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: C.sec, fontSize: 12 }}>
                  {nbTabs}/{ALL_TABS.length}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: C.sec, fontSize: 12 }}>
                  {nbDroits}/{DROITS.length}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "center", color: C.muted, fontSize: 12 }}>
                  {new Date(u.createdAt).toLocaleDateString("fr-FR")}
                </td>
                <td style={{ padding: "10px 12px", textAlign: "right" }}>
                  <button onClick={() => openEdit(u)} style={{
                    padding: "4px 10px", background: "none", border: `1px solid ${C.border}`,
                    borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11, marginRight: 6,
                  }}>
                    Modifier
                  </button>
                  {confirmDelete === u.id ? (
                    <>
                      <button onClick={() => deleteUser(u.id)} style={{
                        padding: "4px 10px", background: C.red, border: "none",
                        borderRadius: 4, color: "#fff", cursor: "pointer", fontSize: 11, marginRight: 4,
                      }}>
                        Confirmer
                      </button>
                      <button onClick={() => setConfirmDelete(null)} style={{
                        padding: "4px 10px", background: "none", border: `1px solid ${C.border}`,
                        borderRadius: 4, color: C.sec, cursor: "pointer", fontSize: 11,
                      }}>
                        Annuler
                      </button>
                    </>
                  ) : (
                    <button onClick={() => setConfirmDelete(u.id)} style={{
                      padding: "4px 10px", background: "none", border: `1px solid ${C.red}`,
                      borderRadius: 4, color: C.red, cursor: "pointer", fontSize: 11,
                    }}>
                      Supprimer
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* ── Modal edition ────────────────────────────────────── */}
      {editUser && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setEditUser(null)}>
          <div style={{
            background: C.s1, borderRadius: 12, padding: 24, width: 700, maxHeight: "85vh",
            overflowY: "auto", border: `1px solid ${C.border}`,
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              {editUser.id ? "Modifier l'utilisateur" : "Nouvel utilisateur"}
            </h3>

            {/* Infos de base */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>Nom *</label>
                <input value={editUser.nom} onChange={e => setEditUser({ ...editUser, nom: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>Email *</label>
                <input value={editUser.email} onChange={e => setEditUser({ ...editUser, email: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>
                  Mot de passe {editUser.id ? "(laisser vide pour ne pas changer)" : "*"}
                </label>
                <input type="password" value={editUser.password} onChange={e => setEditUser({ ...editUser, password: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: C.sec, display: "block", marginBottom: 4 }}>Role</label>
                <select value={editUser.role} onChange={e => setEditUser({ ...editUser, role: e.target.value })}
                  style={{ width: "100%", padding: "8px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, color: C.text, fontSize: 13 }}>
                  <option value="OPERATEUR">OPERATEUR</option>
                  <option value="CHEF_EQUIPE">CHEF EQUIPE</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>
            </div>

            {/* Onglets visibles */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Onglets visibles</span>
                <button onClick={selectAllTabs} style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tout</button>
                <button onClick={selectNoTabs} style={{ fontSize: 11, color: C.sec, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Aucun</button>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {ALL_TABS.map(t => {
                  const active = editUser.tabs.includes(t.id);
                  return (
                    <button key={t.id} onClick={() => toggleTab(t.id)} style={{
                      padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                      border: `1px solid ${active ? C.green : C.border}`,
                      background: active ? "rgba(52,211,153,0.15)" : "transparent",
                      color: active ? C.green : C.sec,
                      fontWeight: active ? 600 : 400,
                    }}>
                      {active ? "✓ " : ""}{t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Droits */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Droits</span>
                <button onClick={selectAllDroits} style={{ fontSize: 11, color: C.blue, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Tout</button>
                <button onClick={selectNoDroits} style={{ fontSize: 11, color: C.sec, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Aucun</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {DROITS.map(d => {
                  const active = editUser.droits.includes(d.id);
                  return (
                    <label key={d.id} style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                      borderRadius: 6, cursor: "pointer", fontSize: 12,
                      border: `1px solid ${active ? C.orange : C.border}`,
                      background: active ? "rgba(251,146,60,0.1)" : "transparent",
                      color: active ? C.text : C.sec,
                    }}>
                      <input type="checkbox" checked={active} onChange={() => toggleDroit(d.id)}
                        style={{ accentColor: C.orange }} />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditUser(null)} style={{
                padding: "8px 16px", background: "none", border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.sec, cursor: "pointer", fontSize: 13,
              }}>
                Annuler
              </button>
              <button onClick={save} disabled={saving} style={{
                padding: "8px 20px", background: C.orange, border: "none",
                borderRadius: 6, color: "#000", fontWeight: 700, cursor: "pointer", fontSize: 13,
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
