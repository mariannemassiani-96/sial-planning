import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// POST /api/chat — Répond aux questions sur les commandes et le planning
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { question } = await req.json();
  if (!question) return NextResponse.json({ error: "question requise" }, { status: 400 });

  const q = question.toLowerCase().trim();

  try {
    // Charger les données nécessaires
    const commandes = await prisma.commande.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

    let answer = "";

    // ── Recherche de commande par client ou chantier ──
    if (q.includes("livraison") && (q.includes("quand") || q.includes("date"))) {
      // "quand est la livraison de Dupont" / "date livraison BAT C"
      const found = findCommande(commandes, q);
      if (found.length > 0) {
        answer = found.map(c => {
          const dl = (c as any).date_livraison_souhaitee;
          return `**${(c as any).client}** — ${(c as any).ref_chantier || ""}` +
            (dl ? ` → Livraison : **${formatDate(dl)}**` : " → Pas de date de livraison");
        }).join("\n");
      } else {
        answer = "Je n'ai pas trouvé cette commande. Essayez avec le nom du client ou du chantier.";
      }
    }
    else if (q.includes("statut") || q.includes("état") || q.includes("avancement") || q.includes("où en est")) {
      const found = findCommande(commandes, q);
      if (found.length > 0) {
        answer = found.map(c => {
          const a = c as any;
          const etapes = [
            a.etape_coupe_ok ? "✓ Coupe" : "○ Coupe",
            a.etape_montage_ok ? "✓ Montage" : "○ Montage",
            a.etape_vitrage_ok ? "✓ Vitrage" : "○ Vitrage",
            a.etape_palette_ok ? "✓ Palette" : "○ Palette",
          ].join(" → ");
          return `**${a.client}** — ${a.ref_chantier || ""}\nStatut : **${a.statut}**\nÉtapes : ${etapes}`;
        }).join("\n\n");
      } else {
        answer = "Commande non trouvée. Précisez le nom du client ou du chantier.";
      }
    }
    else if (q.includes("semaine") && (q.includes("fab") || q.includes("fabrication") || q.includes("production"))) {
      const found = findCommande(commandes, q);
      if (found.length > 0) {
        answer = found.map(c => {
          const a = c as any;
          const sem = a.semaine_coupe || a.semaine_montage || a.semaine_vitrage || "";
          return `**${a.client}** — ${a.ref_chantier || ""}` +
            (sem ? ` → Fabrication : **${weekLabel(sem)}**` : " → Pas encore planifié");
        }).join("\n");
      } else {
        answer = "Commande non trouvée.";
      }
    }
    else if (q.includes("combien") && (q.includes("commande") || q.includes("chantier"))) {
      const actives = commandes.filter(c => {
        const s = (c as any).statut;
        return s !== "livre" && s !== "terminee" && s !== "annulee";
      });
      answer = `Il y a **${actives.length} commandes actives** sur ${commandes.length} au total.`;
    }
    else if (q.includes("retard") || q.includes("en retard") || q.includes("critique")) {
      const retards = commandes.filter(c => {
        const dl = (c as any).date_livraison_souhaitee;
        if (!dl) return false;
        return new Date(dl) < new Date() && (c as any).statut !== "livre";
      });
      if (retards.length === 0) {
        answer = "Aucune commande en retard.";
      } else {
        answer = `**${retards.length} commande(s) en retard :**\n` +
          retards.slice(0, 10).map(c => `- ${(c as any).client} — ${(c as any).ref_chantier || ""} (livraison ${formatDate((c as any).date_livraison_souhaitee)})`).join("\n");
      }
    }
    // ── Comment faire ──
    else if (q.includes("comment") && (q.includes("ajouter") || q.includes("créer") || q.includes("nouvelle"))) {
      answer = "Pour ajouter une commande :\n1. Allez dans l'onglet **➕ Commande**\n2. Remplissez le client, le chantier, le type\n3. Ajoutez les lignes de menuiserie\n4. Cliquez **Enregistrer**";
    }
    else if (q.includes("comment") && (q.includes("planifier") || q.includes("planning") || q.includes("affectation"))) {
      answer = "Pour planifier :\n1. Onglet **Planning > Commandes** : choisissez la semaine de fab et de livraison\n2. Onglet **Planning > Affectations** : glissez les chantiers et opérateurs sur les jours\n3. Cliquez **Audit** pour vérifier qu'il n'y a pas de problème";
    }
    else if (q.includes("comment") && (q.includes("pointer") || q.includes("pointage"))) {
      answer = "Pour pointer :\n1. Allez dans l'onglet **✅ Pointage**\n2. Naviguez au bon jour\n3. Pour chaque tâche : cliquez **✓ Fait**, un %, ou **✕**\n4. Renseignez la durée réelle et qui a fait\n5. Si partiel, choisissez la raison et la date de report";
    }
    else if (q.includes("comment") && (q.includes("imprimer") || q.includes("fiche"))) {
      answer = "Pour imprimer les fiches opérateurs :\n1. Allez dans **Planning > Affectations**\n2. Cliquez **Imprimer les fiches**\n3. Une page par opérateur avec ses tâches de la semaine";
    }
    else {
      // Recherche générique
      const found = findCommande(commandes, q);
      if (found.length > 0) {
        answer = found.slice(0, 5).map(c => {
          const a = c as any;
          return `**${a.client}** — ${a.ref_chantier || ""} | ${a.quantite}× ${a.type} | Statut: ${a.statut} | Livr: ${a.date_livraison_souhaitee ? formatDate(a.date_livraison_souhaitee) : "—"}`;
        }).join("\n");
      } else {
        answer = "Je peux vous aider avec :\n- **Livraison** : \"Quand est la livraison de Dupont ?\"\n- **Statut** : \"Où en est BAT C ?\"\n- **Retards** : \"Quelles commandes sont en retard ?\"\n- **Planning** : \"Comment planifier une semaine ?\"\n- **Pointage** : \"Comment pointer ?\"\n\nEssayez avec un nom de client ou de chantier.";
      }
    }

    return NextResponse.json({ answer });
  } catch (e: any) {
    return NextResponse.json({ answer: "Erreur : " + e.message });
  }
}

// ── Helpers ──

function findCommande(commandes: any[], query: string): any[] {
  const words = query.split(/\s+/).filter(w => w.length > 2);
  return commandes.filter(c => {
    const text = `${(c as any).client} ${(c as any).ref_chantier} ${(c as any).num_commande}`.toLowerCase();
    return words.some(w => text.includes(w) && !["quand", "date", "livraison", "statut", "état", "comment", "combien", "commande", "semaine", "retard"].includes(w));
  }).slice(0, 10);
}

function formatDate(d: string): string {
  try { return new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
  catch { return d; }
}

function weekLabel(mondayStr: string): string {
  try {
    const d = new Date(mondayStr + "T00:00:00");
    const jan4 = new Date(d.getFullYear(), 0, 4);
    const w1 = new Date(jan4); w1.setDate(jan4.getDate() - ((jan4.getDay() || 7) - 1));
    const wn = Math.ceil((d.getTime() - w1.getTime()) / (7 * 86400000)) + 1;
    return `S${String(wn).padStart(2, "0")}`;
  } catch { return mondayStr; }
}
