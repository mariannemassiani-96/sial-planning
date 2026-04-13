import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { EQUIPE, hm, calcChargeSemaine } from "@/lib/sial-data";

// ── Auto-migration MemoAction ───────────────────────────────────────────────
let migDone = false;
async function ensureMemoTable() {
  if (migDone) return;
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MemoAction" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "auteur" TEXT NOT NULL,
        "texte" TEXT NOT NULL,
        "type" TEXT NOT NULL DEFAULT 'memo',
        "priorite" TEXT NOT NULL DEFAULT 'normale',
        "statut" TEXT NOT NULL DEFAULT 'ouvert',
        "echeance" TEXT,
        "assigneA" TEXT,
        "commandeId" TEXT,
        "poste" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    migDone = true;
  } catch {}
}

// ── Mots-clés pour détecter les intentions ──────────────────────────────────

const INTENT_PATTERNS = {
  creer_tache: [
    /(?:cr[eé]e|ajoute|faut|il faut|faudrait|pense[rz]?\s+[àa]|oublie[rz]?\s+pas|n'oublie[rz]?\s+pas)\s+(?:une?\s+)?(?:t[aâ]che|action|memo|m[eé]mo)/i,
    /(?:cr[eé]e|ajoute|faut|il faut)\s+/i,
    /(?:faut\s+(?:pas\s+)?(?:oublier|qu'on|que|changer|v[eé]rifier|commander|pr[eé]parer|nettoyer|r[eé]parer|appeler|faire))/i,
    /(?:attention|urgent|important)\s*[,:!]?\s*/i,
    /(?:changer|v[eé]rifier|commander|pr[eé]parer|nettoyer|r[eé]parer)\s+/i,
  ],
  question_planning: [
    /(?:c'est quoi|quel(?:le)?|combien|qui)\s+(?:la charge|le planning|les commandes|la semaine)/i,
    /(?:charge|planning|commandes?|semaine)\s+(?:de|du|pour)\s+/i,
    /(?:qu'est.ce qu|que|quoi)\s+.*(?:demain|lundi|mardi|mercredi|jeudi|vendredi|cette semaine|semaine prochaine)/i,
  ],
  modifier_planning: [
    /(?:met[s]?|place|ajoute|d[eé]place|bouge)\s+(?:la\s+)?(?:commande|cmd)/i,
    /(?:met[s]?|place|ajoute)\s+.*(?:en\s+coupe|en\s+montage|en\s+vitrage|au\s+coulissant|aux?\s+frappes)/i,
  ],
  salutation: [
    /^(?:bonjour|salut|hello|coucou|hey|bonsoir)/i,
  ],
};

// ── Détection priorité ──────────────────────────────────────────────────────

function detectPriorite(texte: string): "normale" | "urgente" | "critique" {
  if (/(?:urgent|critique|imm[eé]diat|tout de suite|vite|asap)/i.test(texte)) return "urgente";
  if (/(?:attention|important|surtout|absolument)/i.test(texte)) return "urgente";
  return "normale";
}

// ── Détection poste ─────────────────────────────────────────────────────────

function detectPoste(texte: string): string | null {
  const lower = texte.toLowerCase();
  if (/(?:double\s*t[eê]te|dt)/.test(lower)) return "C4";
  if (/(?:lmt|lame|coupe)/.test(lower)) return "C3";
  if (/(?:soudure|souder|soudage)/.test(lower)) return "C6";
  if (/(?:coulissant|galandage|dormant\s*coul)/.test(lower)) return "M1";
  if (/(?:frappe|ferrage|mise\s*en\s*bois)/.test(lower)) return "F1";
  if (/(?:vitrage|vitr[eé])/.test(lower)) return "V1";
  if (/(?:palette|emballage|exp[eé]dition)/.test(lower)) return "V3";
  if (/(?:maintenance|r[eé]par|panne|machine|lame)/.test(lower)) return "MAINT";
  if (/(?:nettoyage|nettoyer|propre)/.test(lower)) return "NETT";
  if (/(?:isula|verre)/.test(lower)) return "I1";
  return null;
}

// ── Détection opérateur ─────────────────────────────────────────────────────

function detectOperateur(texte: string): string | null {
  const lower = texte.toLowerCase();
  for (const m of EQUIPE) {
    if (lower.includes(m.nom.toLowerCase())) return m.id;
    if (lower.includes(m.id.toLowerCase())) return m.id;
  }
  // Raccourcis
  if (/\bjf\b/i.test(texte)) return "jf";
  if (/\bjp\b/i.test(texte)) return "jp";
  return null;
}

// ── Détection date ──────────────────────────────────────────────────────────

function detectDate(texte: string): string | null {
  const lower = texte.toLowerCase();
  const today = new Date();

  if (/(?:aujourd'?hui|auj|ce jour)/i.test(lower)) {
    return today.toISOString().split("T")[0];
  }
  if (/demain/i.test(lower)) {
    const d = new Date(today); d.setDate(d.getDate() + 1);
    return d.toISOString().split("T")[0];
  }

  const jourMap: Record<string, number> = {
    lundi: 1, mardi: 2, mercredi: 3, jeudi: 4, vendredi: 5,
  };
  for (const [jour, dow] of Object.entries(jourMap)) {
    if (lower.includes(jour)) {
      const d = new Date(today);
      const currentDow = d.getDay();
      let diff = dow - currentDow;
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().split("T")[0];
    }
  }

  // Format dd/mm ou dd/mm/yyyy
  const dateMatch = texte.match(/(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/);
  if (dateMatch) {
    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]) - 1;
    const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : today.getFullYear();
    const d = new Date(year, month, day);
    return d.toISOString().split("T")[0];
  }

  return null;
}

// ── Détection type de tâche ─────────────────────────────────────────────────

function detectTypeTache(texte: string): string {
  const lower = texte.toLowerCase();
  if (/(?:maintenance|r[eé]par|panne|machine|lame|outil|graiss)/i.test(lower)) return "tache";
  if (/(?:commander|commande[rz]|achat|acheter|stock|approvision)/i.test(lower)) return "tache";
  if (/(?:rappel|n'oublie|pense|faudrait)/i.test(lower)) return "rappel";
  if (/(?:attention|pr[eé]venir|signaler|probl[eè]me)/i.test(lower)) return "memo";
  return "tache";
}

// ── Interprétation et exécution ─────────────────────────────────────────────

function detectIntent(texte: string): "creer_tache" | "question_planning" | "modifier_planning" | "salutation" | "inconnu" {
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (patterns.some(p => p.test(texte))) {
      return intent as any;
    }
  }
  // Par défaut si le texte est court et impératif, c'est une tâche
  if (texte.length > 5 && texte.length < 200) return "creer_tache";
  return "inconnu";
}

async function handleCreerTache(texte: string, auteur: string): Promise<{ message: string; action: string; data?: any }> {
  await ensureMemoTable();

  const priorite = detectPriorite(texte);
  const poste = detectPoste(texte);
  const assigneA = detectOperateur(texte);
  const echeance = detectDate(texte);
  const type = detectTypeTache(texte);

  const rows = await prisma.$queryRaw`
    INSERT INTO "MemoAction" ("id", "auteur", "texte", "type", "priorite", "statut", "echeance", "assigneA", "poste", "updatedAt")
    VALUES (
      gen_random_uuid()::text,
      ${auteur},
      ${texte},
      ${type},
      ${priorite},
      'ouvert',
      ${echeance},
      ${assigneA},
      ${poste},
      NOW()
    )
    RETURNING *
  `;
  const memo = (rows as any[])[0];

  const parts: string[] = [];
  parts.push(`**${type === "tache" ? "Tache" : type === "rappel" ? "Rappel" : "Memo"} cree**${priorite !== "normale" ? ` (${priorite.toUpperCase()})` : ""}`);
  parts.push(`"${texte}"`);
  if (poste) parts.push(`Poste : ${poste}`);
  if (assigneA) {
    const op = EQUIPE.find(m => m.id === assigneA);
    parts.push(`Assigne a : ${op?.nom ?? assigneA}`);
  }
  if (echeance) parts.push(`Echeance : ${echeance}`);

  return {
    message: parts.join("\n"),
    action: "tache_creee",
    data: memo,
  };
}

async function handleQuestionPlanning(texte: string): Promise<{ message: string; action: string }> {
  try {
    const commandes = await prisma.commande.findMany({
      where: { statut: { notIn: ["terminee", "livre"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const lower = texte.toLowerCase();

    // Charge globale
    if (/charge|combien.*travail|combien.*commandes/i.test(lower)) {
      const charge = calcChargeSemaine(commandes.map(c => ({
        type: c.type, quantite: c.quantite, hsTemps: c.hsTemps as any,
      })));
      const lines = [
        `**${commandes.length} commandes en cours**`,
        `Coupe : ${hm(charge.coupe)}`,
        `Frappes : ${hm(charge.frappes)}`,
        `Coulissant : ${hm(charge.coulissant)}`,
        `Vitrage : ${hm(charge.vitrage_ov)}`,
      ];
      return { message: lines.join("\n"), action: "info_charge" };
    }

    // Combien de commandes
    if (/combien.*commande/i.test(lower)) {
      return {
        message: `Il y a **${commandes.length} commandes actives** en ce moment.`,
        action: "info_commandes",
      };
    }

    // Commandes urgentes
    if (/urgent|priorit/i.test(lower)) {
      const urgentes = commandes.filter(c => c.priorite === "urgente" || c.priorite === "chantier_bloque");
      if (urgentes.length === 0) return { message: "Aucune commande urgente en ce moment.", action: "info_urgentes" };
      const lines = [`**${urgentes.length} commande(s) urgente(s) :**`];
      urgentes.slice(0, 5).forEach(c => {
        lines.push(`- ${c.num_commande} ${c.client} (${c.priorite})`);
      });
      return { message: lines.join("\n"), action: "info_urgentes" };
    }

    return {
      message: `Il y a **${commandes.length} commandes actives**. Posez-moi une question plus precise (charge, urgentes, etc.)`,
      action: "info_general",
    };
  } catch {
    return { message: "Erreur lors de la lecture des donnees.", action: "erreur" };
  }
}

function handleSalutation(auteur: string): { message: string; action: string } {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bonjour" : hour < 18 ? "Bon apres-midi" : "Bonsoir";
  return {
    message: `${greeting} ${auteur} ! Je suis votre assistant planning.\n\nVous pouvez me dire :\n- **Creer une tache** : "Faut changer la lame de la double tete"\n- **Poser une question** : "C'est quoi la charge de la semaine ?"\n- **Signaler un probleme** : "Attention panne machine coupe"`,
    action: "salutation",
  };
}

// ── Route POST /api/assistant ───────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Non authentifie" }, { status: 401 });

  try {
    const { message } = await req.json();
    if (!message || typeof message !== "string") {
      return NextResponse.json({ error: "Message requis" }, { status: 400 });
    }

    const auteur = (session.user as any)?.name || "inconnu";
    const texte = message.trim();
    const intent = detectIntent(texte);

    let result: { message: string; action: string; data?: any };

    switch (intent) {
      case "salutation":
        result = handleSalutation(auteur);
        break;
      case "creer_tache":
        result = await handleCreerTache(texte, auteur);
        break;
      case "question_planning":
        result = await handleQuestionPlanning(texte);
        break;
      case "modifier_planning":
        result = {
          message: "La modification du planning par commande vocale sera bientot disponible. Pour l'instant, utilisez l'onglet Planning.",
          action: "non_disponible",
        };
        break;
      default:
        // Par défaut, on crée une tâche
        result = await handleCreerTache(texte, auteur);
        break;
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Erreur assistant" }, { status: 500 });
  }
}
