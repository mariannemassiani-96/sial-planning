// ═══════════════════════════════════════════════════════════════════════
// NOMENCLATURE COMPLÈTE — Planning Industriel SIAL+ISULA — Groupe VISTA
// SOURCE : capcite_pro.docx + Manuel atelier
// ═══════════════════════════════════════════════════════════════════════

export interface TypeMenuiserie {
  label: string;
  mat: "PVC" | "ALU" | "ALU/PVC";
  famille: "frappe" | "coulissant" | "glandage" | "porte" | "hors_standard" | "intervention";
  dormant: number;
  ouvrants: number;
  lmt: number;
  dt: number;
  renfort: number;
  profils_total?: number;
}

export const TYPES_MENUISERIE: Record<string, TypeMenuiserie> = {
  ob1_pvc:    { label:"OB1 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:8  },
  of1_pvc:    { label:"OF1 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:8  },
  ob2_pvc:    { label:"OB2 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:10 },
  of2_pvc:    { label:"OF2 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:10 },
  fixe_pvc:   { label:"Fixe PVC", mat:"PVC", famille:"frappe",     dormant:1, ouvrants:0, lmt:4,  dt:0, renfort:4  },
  pf1_pvc:    { label:"PF1 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:8  },
  pf2_pvc:    { label:"PF2 PVC",  mat:"PVC", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:10 },
  ob1_alu:    { label:"OB1 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:0  },
  of1_alu:    { label:"OF1 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:0  },
  ob2_alu:    { label:"OB2 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:0  },
  of2_alu:    { label:"OF2 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:0  },
  fixe_alu:   { label:"Fixe ALU", mat:"ALU", famille:"frappe",     dormant:1, ouvrants:0, lmt:8,  dt:0, renfort:0  },
  pf1_alu:    { label:"PF1 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:1, lmt:8,  dt:0, renfort:0  },
  pf2_alu:    { label:"PF2 ALU",  mat:"ALU", famille:"frappe",     dormant:1, ouvrants:2, lmt:10, dt:1, renfort:0  },
  p1_alu:     { label:"P1 ALU",   mat:"ALU", famille:"porte",      dormant:1, ouvrants:1, lmt:11, dt:2, renfort:0  },
  p2_alu:     { label:"P2 ALU",   mat:"ALU", famille:"porte",      dormant:1, ouvrants:2, lmt:19, dt:3, renfort:0  },
  c2v2r:      { label:"C2V2R",    mat:"ALU", famille:"coulissant",  dormant:1, ouvrants:2, lmt:12, dt:3, renfort:0  },
  c3v3r:      { label:"C3V3R",    mat:"ALU", famille:"coulissant",  dormant:1, ouvrants:3, lmt:16, dt:4, renfort:0  },
  c4v4r:      { label:"C4V4R",    mat:"ALU", famille:"coulissant",  dormant:2, ouvrants:4, lmt:29, dt:5, renfort:0  },
  c4v2r:      { label:"C4V2R",    mat:"ALU", famille:"coulissant",  dormant:1, ouvrants:4, lmt:21, dt:3, renfort:0  },
  g1v1r:      { label:"G1V1R",    mat:"ALU", famille:"glandage",    dormant:1, ouvrants:1, lmt:12, dt:3, renfort:0  },
  g2v1r:      { label:"G2V1R",    mat:"ALU", famille:"glandage",    dormant:1, ouvrants:2, lmt:17, dt:5, renfort:0  },
  g2v2r:      { label:"G2V2R",    mat:"ALU", famille:"glandage",    dormant:1, ouvrants:2, lmt:15, dt:4, renfort:0  },
  g3v3r:      { label:"G3V3R",    mat:"ALU", famille:"glandage",    dormant:1, ouvrants:3, lmt:20, dt:9, renfort:0  },
  g4v2r:      { label:"G4V2R",    mat:"ALU", famille:"glandage",    dormant:1, ouvrants:4, lmt:18, dt:7, renfort:0  },
  hors_standard:         { label:"Hors Standard",         mat:"ALU/PVC", famille:"hors_standard", dormant:0, ouvrants:0, lmt:0, dt:0, renfort:0 },
  intervention_chantier: { label:"Intervention Chantier", mat:"ALU/PVC", famille:"intervention",    dormant:0, ouvrants:0, lmt:0, dt:0, renfort:0 },
};

// Calculer profils_total
Object.values(TYPES_MENUISERIE).forEach(tm => {
  tm.profils_total = tm.lmt || 0;
});

export const OPERATEURS_VITRAGE_HS = [
  { id:"quentin",  label:"Quentin" },
  { id:"michel",   label:"Michel" },
  { id:"jf",       label:"Jean-François" },
  { id:"jp",       label:"Jean-Pierre" },
  { id:"bruno",    label:"Bruno" },
];

export const T = {
  coupe_profil:           1,
  ouvrant_coul_prep:      5,
  soudure_cadre:          5,
  poincon_assemblage_alu: 10,
  pose_rails_accessoires: 10,
  montage_dormant_coul:   30,
  montage_dormant_gland:  60,
  ferrage_ouvrant:        10,
  prep_dormant:           5,
  mise_en_bois:           5,
  vitrage_frappe:         10,
  vitrage_ouvrant_coul:   20,
  controle:               2,
  mise_palette:           5,
  lancement_matin:        10,
  nettoyage_soir:         15,
  prep_deballage_joints_sem: 480,
  coupe_double_tete_sem:     960,
};

export interface HsTemps {
  nb_profils?: string | number;
  t_coupe?: string | number;
  t_montage?: string | number;
  t_vitrage?: string | number;
  operateur_montage?: string;
  operateur_vitrage?: string;
  notes?: string;
}

export interface TempsType {
  typeId: string;
  label: string;
  mat: string;
  famille: string;
  quantite: number;
  profils_total: number;
  ouvrants_masques: number;
  par_poste: {
    coupe: number;
    coulissant: number;
    frappes: number;
    vitrage_ov: number;
  };
  tTotal: number;
  operateur_vitrage?: string;
  operateur_montage?: string;
  notes?: string;
}

export function calcTempsType(typeId: string, quantite = 1, hsTemps?: HsTemps | null): TempsType | null {
  const tm = TYPES_MENUISERIE[typeId];
  if (!tm) return null;

  if (tm.famille === "intervention") {
    const tIntervention = Math.round(parseFloat(String(hsTemps?.t_montage)) || 0);
    return {
      typeId, label: tm.label, mat: tm.mat, famille: "intervention", quantite,
      profils_total: 0, ouvrants_masques: 0,
      par_poste: { coupe: 0, coulissant: 0, frappes: tIntervention, vitrage_ov: 0 },
      tTotal: tIntervention,
      operateur_montage: hsTemps?.operateur_montage || "jp",
      notes: hsTemps?.notes || "",
    };
  }

  if (tm.famille === "hors_standard" && hsTemps) {
    // Pour le hors standard, les temps saisis sont des totaux commande (pas par pièce)
    const pp = {
      coupe:      Math.round(parseFloat(String(hsTemps.t_coupe))   || 0),
      coulissant: 0,
      frappes:    Math.round(parseFloat(String(hsTemps.t_montage)) || 0),
      vitrage_ov: Math.round(parseFloat(String(hsTemps.t_vitrage)) || 0),
    };
    return {
      typeId, label: tm.label, mat: tm.mat, famille: "hors_standard", quantite,
      profils_total: Math.round(parseFloat(String(hsTemps.nb_profils)) || 0),
      ouvrants_masques: 0,
      par_poste: pp,
      tTotal: Object.values(pp).reduce((s, v) => s + v, 0),
      operateur_vitrage: hsTemps.operateur_vitrage || "quentin",
      operateur_montage: hsTemps.operateur_montage || "jp",
      notes: hsTemps.notes || "",
    };
  }

  const q = quantite;
  const { mat, famille, ouvrants } = tm;
  const isPVC = mat === "PVC";
  const isCoul = famille === "coulissant";
  const isGland = famille === "glandage";
  const isFrappe = famille === "frappe" || famille === "porte";

  const tCoupe = ((tm.lmt || 0) * T.coupe_profil + (tm.dt || 0) * 1.5 + (tm.renfort || 0) * 2) * q;
  const nbCadres = 1 + ouvrants;
  const tSoudurePoincon = isPVC && isFrappe
    ? T.soudure_cadre * nbCadres * q
    : (!isPVC && isFrappe ? T.poincon_assemblage_alu * nbCadres * q : 0);

  const tMontDormantCoul = isCoul ? (T.pose_rails_accessoires + T.montage_dormant_coul) * q : 0;
  const tMontDormantGland = isGland ? (T.pose_rails_accessoires + T.montage_dormant_gland) * q : 0;

  const tFerrage = isFrappe ? T.ferrage_ouvrant * ouvrants * q : 0;
  const tPrepDormant = isFrappe ? T.prep_dormant * q : 0;
  const tMiseEnBois = isFrappe ? T.mise_en_bois * q : 0;
  const tVitrageFrappe = isFrappe ? T.vitrage_frappe * ouvrants * q : 0;
  const tControle = isFrappe ? T.controle * q : 0;
  const tPaletteFrappe = isFrappe ? T.mise_palette * q : 0;

  const tVitrageOuv = (isCoul || isGland) ? T.vitrage_ouvrant_coul * ouvrants * q : 0;
  const tPaletteCoul = (isCoul || isGland) ? T.mise_palette * q : 0;

  const tPosteCoupe = tCoupe + tSoudurePoincon;
  const tPosteCoul = tMontDormantCoul + tMontDormantGland;
  const tPosteFrappes = tFerrage + tPrepDormant + tMiseEnBois + tVitrageFrappe + tControle + tPaletteFrappe;
  const tPosteVitOuv = tVitrageOuv + tPaletteCoul;

  return {
    typeId, label: tm.label, mat, famille, quantite,
    profils_total: (tm.profils_total || 0) * q,
    ouvrants_masques: ouvrants * q,
    par_poste: {
      coupe:      Math.round(tPosteCoupe),
      coulissant: Math.round(tPosteCoul),
      frappes:    Math.round(tPosteFrappes),
      vitrage_ov: Math.round(tPosteVitOuv),
    },
    tTotal: Math.round(tPosteCoupe + tPosteCoul + tPosteFrappes + tPosteVitOuv),
  };
}

export interface CommandeCalc {
  type: string;
  quantite: number;
  hsTemps?: HsTemps | null;
}

export function calcChargeSemaine(commandes: CommandeCalc[]) {
  const parPoste = { coupe: 0, coulissant: 0, frappes: 0, vitrage_ov: 0 };
  commandes.forEach(cmd => {
    const t = calcTempsType(cmd.type, cmd.quantite, cmd.hsTemps);
    if (!t) return;
    (Object.keys(t.par_poste) as Array<keyof typeof parPoste>).forEach(p => {
      parPoste[p] = (parPoste[p] || 0) + t.par_poste[p];
    });
  });
  parPoste.coupe += T.prep_deballage_joints_sem + T.coupe_double_tete_sem;
  return parPoste;
}

export function calcLogistique(commandes: CommandeCalc[]) {
  let lmt = 0, dt = 0, renfort = 0, ouvrantsCoul = 0, pieces = 0;
  commandes.forEach(cmd => {
    const tm = TYPES_MENUISERIE[cmd.type];
    if (!tm) return;
    lmt     += (tm.lmt     || 0) * cmd.quantite;
    dt      += (tm.dt      || 0) * cmd.quantite;
    renfort += (tm.renfort || 0) * cmd.quantite;
    if (tm.famille === "coulissant" || tm.famille === "glandage") ouvrantsCoul += tm.ouvrants * cmd.quantite;
    pieces += cmd.quantite;
  });
  const total_pieces_coupe = lmt + dt + renfort;
  return {
    lmt, dt, renfort, total_pieces_coupe, ouvrantsCoul, pieces,
    chariots_profils:  Math.ceil(total_pieces_coupe / 80),
    chariots_vitrages: Math.ceil(ouvrantsCoul / 15),
    palettes:          Math.ceil(ouvrantsCoul / 6),
  };
}

export const STOCKS_DEF: Record<string, {
  label: string; localisation: string; unite: string;
  cap_unite: number; min: number; max: number; cible: number;
  raison: string; c: string;
}> = {
  profils_coupes:   { label:"Profilés coupés (chariots)",  localisation:"Zone tampon coupe→montage",   unite:"chariots", cap_unite:80,  min:1, max:4,   cible:2,   raison:"80 pièces/chariot · Coupe J → Montage J+15 (tampon officiel)",  c:"#42A5F5" },
  vitrages_isula:   { label:"Vitrages ISULA",               localisation:"Zone stockage vitrages SIAL", unite:"chariots", cap_unite:15,  min:2, max:6,   cible:3,   raison:"15 vitrages/chariot · ISULA 300 vitrages/sem · Tampon 4j",        c:"#26C6DA" },
  ouvrants_vitres:  { label:"Ouvrants coulissant vitrés",   localisation:"Zone palette ouvrants",       unite:"palettes", cap_unite:6,   min:2, max:10,  cible:4,   raison:"6 ouvrants/palette expédition · Jean-François produit en avance", c:"#66BB6A" },
  accessoires_prep: { label:"Accessoires préparés",         localisation:"Bacs par poste (Guillaume)",  unite:"jours",    cap_unite:1,   min:1, max:5,   cible:3,   raison:"Guillaume prépare 3 jours à l'avance poste par poste",           c:"#FFA726" },
  profils_bruts:    { label:"Profilés bruts magasin",        localisation:"Magasin profilés",            unite:"semaines", cap_unite:1,   min:2, max:4,   cible:3,   raison:"Livraison 1×/sem ALU + 1×/sem PVC — stock 3 semaines",           c:"#CE93D8" },
  verre_brut:       { label:"Verre brut ISULA",              localisation:"Stockage verre ISULA",        unite:"m²",       cap_unite:1,   min:100,max:400,cible:250, raison:"Délai fournisseur >1 semaine — ISULA 300 vitrages/sem",          c:"#4DB6AC" },
};

// Compétences postes : coupe, frappes, coulissant, vitrage, logistique, isula
export const POSTES_COMPETENCES = [
  { id:"coupe",       label:"Coupe",       c:"#42A5F5" },
  { id:"frappes",     label:"Frappes",     c:"#FFA726" },
  { id:"coulissant",  label:"Coulissant",  c:"#66BB6A" },
  { id:"vitrage",     label:"Vitrage",     c:"#26C6DA" },
  { id:"logistique",  label:"Logistique",  c:"#CE93D8" },
  { id:"isula",       label:"ISULA",       c:"#4DB6AC" },
];

export const EQUIPE = [
  { id:"guillaume", nom:"Guillaume",     poste:"logistique", h:39, vendrediOff:false, remplace:["isula_op","vitrage"], competences:["logistique","vitrage","isula"],      note:"Réceptions · Rangement · Prépa accessoires · Chargements · 8h L-J, 7h V" },
  { id:"momo",      nom:"Momo",          poste:"isula",      h:39, vendrediOff:false, remplace:["vitrage"],            competences:["isula","vitrage"],                   note:"Opérateur ISULA A→Z · Remplace vitrage · 8h L-J, 7h V" },
  { id:"bruno",     nom:"Bruno",         poste:"isula",      h:39, vendrediOff:false, remplace:["isula_op"],           competences:["isula","frappes","coulissant"],       note:"Responsable QC+procédures ISULA+SIAL · Supervision · 8h L-J, 7h V" },
  { id:"ali",       nom:"Ali",           poste:"isula",      h:35, vendrediOff:false, remplace:[],                     competences:["isula"],                             note:"Opérateur ISULA A→Z · 7h/jour" },
  { id:"jp",        nom:"Jean-Pierre",   poste:"hors_std",   h:36, vendrediOff:false, remplace:["frappes","coulissant","vitrage"], competences:["frappes","coulissant","vitrage","coupe"], note:"Sur-mesure / Luxe / Hors-normes · Polyvalent · 8h L-J, vendredi matin seul (4h)" },
  { id:"jf",        nom:"Jean-François", poste:"frappes",    h:39, vendrediOff:false, remplace:["coulissant","vitrage"], competences:["frappes","coulissant","vitrage","coupe"], note:"Montage frappes · Polyvalent coulissant+vitrage+coupe · 8h L-J, 7h V" },
  { id:"michel",    nom:"Michel",        poste:"frappes",    h:35, vendrediOff:false, remplace:["coulissant","soudure_pvc"], competences:["frappes","coulissant","coupe"],  note:"Montage frappes · Polyvalent coulissant+soudure PVC · 7h/jour" },
  { id:"alain",     nom:"Alain",         poste:"coulissant", h:30, vendrediOff:true,  remplace:["frappes"],            competences:["coulissant","frappes"],               note:"Montage dormants coulissant+galandage · SEUL sur ce poste · Absent vendredi · 7h30 L-J" },
  { id:"francescu", nom:"Francescu",     poste:"frappes",    h:39, vendrediOff:false, remplace:[],                     competences:["frappes","coupe"],                    note:"Montage frappes · Soutien coupe · 8h L-J, 7h V" },
  { id:"julien",    nom:"Julien",        poste:"coupe",      h:39, vendrediOff:false, remplace:[], specialite:"Double tête", competences:["coupe"],                        note:"Prépa + coupe LMT + coupe double tête (seul) · 8h L-J, 7h V" },
  { id:"laurent",   nom:"Laurent",       poste:"coupe",      h:39, vendrediOff:false, remplace:["logistique"], specialite:"Soudure PVC", competences:["coupe","logistique"], note:"Prépa + coupe LMT + soudure PVC (seul) + soutien expédition · 8h L-J, 7h V" },
  { id:"mateo",     nom:"Matéo",         poste:"coupe",      h:35, vendrediOff:false, remplace:[],                     competences:["coupe"],                             note:"Coupe · Apprenti avancé · 7h/jour" },
  { id:"kentin",    nom:"Kentin",        poste:"coupe",      h:35, vendrediOff:false, remplace:["frappes"],            competences:["coupe","frappes"],                    note:"Coupe + soutien montage frappes · 7h/jour" },
];

export const ZONES = ["SIAL","Porto-Vecchio","Balagne","Ajaccio","Plaine Orientale","Continent","Sur chantier","Autre"];

export const TAMPONS_OFFICIELS = {
  coupe_livraison: 15,
  vitrage_livraison: 4,
};

export const TAMPON_MIN = 4 * 60;
export const TAMPON_COUPE_LIVRAISON = 15;
export const TAMPON_VITRAGE_LIVRAISON = 4;

// Jours fériés et jours non travaillés (YYYY-MM-DD)
export const JOURS_FERIES: Record<string, string> = {
  // 2025
  "2025-01-01": "Jour de l'An",
  "2025-04-21": "Lundi de Pâques",
  "2025-05-01": "Fête du Travail",
  "2025-05-08": "Victoire 1945",
  "2025-05-29": "Ascension",
  "2025-06-09": "Lundi de Pentecôte",
  "2025-07-14": "Fête Nationale",
  "2025-08-15": "Assomption",
  "2025-11-01": "Toussaint",
  "2025-11-11": "Armistice",
  "2025-12-25": "Noël",
  // 2026
  "2026-01-01": "Jour de l'An",
  "2026-04-06": "Lundi de Pâques",
  "2026-05-01": "Fête du Travail",
  "2026-05-08": "Victoire 1945",
  "2026-05-14": "Ascension",
  "2026-05-25": "Lundi de Pentecôte",
  "2026-07-14": "Fête Nationale",
  "2026-08-15": "Assomption",
  "2026-11-01": "Toussaint",
  "2026-11-11": "Armistice",
  "2026-12-25": "Noël",
};

export function isWorkday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const dow = d.getDay();
  return dow !== 0 && dow !== 6 && !JOURS_FERIES[dateStr];
}

export function hm(m: number): string {
  if (!m) return "0h00";
  return `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
}

export function fmtDate(d?: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR");
}

export function nextWorkday(dateStr: string): string {
  const d = new Date(dateStr);
  let s = d.toISOString().split("T")[0];
  while (!isWorkday(s)) { d.setDate(d.getDate() + 1); s = d.toISOString().split("T")[0]; }
  return s;
}

export function addWorkdays(dateStr: string, days: number): string {
  const d = new Date(nextWorkday(dateStr));
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const s = d.toISOString().split("T")[0];
    if (isWorkday(s)) added++;
  }
  return d.toISOString().split("T")[0];
}

export function addWorkMinutes(dateStr: string, minutes: number): string {
  const jours = Math.ceil(minutes / 480);
  return addWorkdays(dateStr, Math.max(1, jours));
}

export function dateDemarrage(cmd: { date_alu?: string | null; date_pvc?: string | null; date_accessoires?: string | null }): string {
  const dates = [cmd.date_alu, cmd.date_pvc, cmd.date_accessoires].filter(Boolean).map(d => new Date(d!));
  if (!dates.length) return nextWorkday(new Date().toISOString().split("T")[0]);
  const max = new Date(Math.max(...dates.map(d => d.getTime()))).toISOString().split("T")[0];
  return nextWorkday(max);
}

export interface CommandeCC extends CommandeCalc {
  id?: string | number;
  client?: string;
  ref_chantier?: string | null;
  num_commande?: string;
  priorite?: string;
  statut?: string;
  date_alu?: string | null;
  date_pvc?: string | null;
  date_accessoires?: string | null;
  date_panneau_porte?: string | null;
  date_volet_roulant?: string | null;
  date_livraison_souhaitee?: string | null;
  etape_coupe_ok?: boolean;
  etape_montage_ok?: boolean;
  etape_vitrage_ok?: boolean;
  etape_palette_ok?: boolean;
  etape_coupe_date?: string | null;
  etape_montage_date?: string | null;
  etape_vitrage_date?: string | null;
  etape_palette_date?: string | null;
}

export function calcCheminCritique(cmd: CommandeCC) {
  const tm = TYPES_MENUISERIE[cmd.type];
  if (!tm) return null;
  if (tm.famille === "intervention") return null;
  const t = calcTempsType(cmd.type, cmd.quantite, cmd.hsTemps);
  if (!t) return null;
  const dd = dateDemarrage(cmd);
  if (!dd) return null;

  const etapes: Array<{
    id: string; label: string; debut: string; fin: string;
    duree_min: number; qui: string; couleur: string; optionnel?: boolean;
    cmd_vitrage?: string;
  }> = [];
  let cursor = dd;

  // Commande vitrage ISULA dès le démarrage fab (délai livraison ISULA)
  const dateCmdVitrage = dd;

  const tCoupe = t.par_poste.coupe || 0;
  // Modèle parallèle : LMT partagé ÷3, puis spécialités en parallèle
  // Julien = double-tête, Mateo = renfort, Laurent = soudure PVC / poinçon ALU
  const tLMT_p  = (tm.lmt || 0) * T.coupe_profil * cmd.quantite;
  const tDT_p   = (tm.dt  || 0) * 1.5            * cmd.quantite;
  const tRenf_p = (tm.renfort || 0) * 2           * cmd.quantite;
  const nbCadresP = 1 + tm.ouvrants;
  const isFrappeP = tm.famille === "frappe" || tm.famille === "porte";
  const tSoud_p = tm.mat === "PVC" && isFrappeP
    ? T.soudure_cadre * nbCadresP * cmd.quantite
    : (!( tm.mat === "PVC") && isFrappeP ? T.poincon_assemblage_alu * nbCadresP * cmd.quantite : 0);
  const tCoupeEff = tm.famille === "hors_standard"
    ? tCoupe
    : tLMT_p / 3 + Math.max(tDT_p, tRenf_p, tSoud_p);
  const finCoupe = tCoupeEff > 0 ? addWorkMinutes(cursor, Math.round(tCoupeEff)) : cursor;
  etapes.push({ id:"coupe", label:"Coupe / Soudure", debut:cursor, fin:finCoupe, duree_min:Math.round(tCoupeEff), qui:"Julien · Laurent · Mateo", couleur:"#42A5F5" });

  cursor = addWorkMinutes(finCoupe, TAMPON_MIN);

  const tMontage = (t.par_poste.frappes || 0) + (t.par_poste.coulissant || 0);
  const nbOpMontage = tm.famille === "hors_standard" ? 1 : tm.famille === "frappe" || tm.famille === "porte" ? 2 : 1;
  const finMontage = tMontage > 0 ? addWorkMinutes(cursor, Math.round(tMontage / nbOpMontage)) : cursor;
  const quiMontage = tm.famille === "coulissant" || tm.famille === "glandage" ? "Alain" : tm.famille === "hors_standard" ? "Jean-Pierre (HS)" : "Michel · Jean-François";
  etapes.push({ id:"montage", label:"Montage", debut:cursor, fin:finMontage, duree_min:Math.round(tMontage/nbOpMontage), qui:quiMontage, couleur:"#FFA726" });

  cursor = addWorkMinutes(finMontage, TAMPON_MIN);

  const tVitrageReel = tm.famille === "hors_standard"
    ? Math.round(parseFloat(String(cmd.hsTemps?.t_vitrage)) || 0)
    : t.par_poste.vitrage_ov || 0;
  const finVitrage = tVitrageReel > 0 ? addWorkMinutes(cursor, tVitrageReel) : cursor;
  const quiVitrage = cmd.hsTemps?.operateur_vitrage
    ? (OPERATEURS_VITRAGE_HS.find(o => o.id === cmd.hsTemps!.operateur_vitrage)?.label || "Quentin")
    : tm.famille === "coulissant" || tm.famille === "glandage" ? "Quentin" : "Michel / Jean-François";
  etapes.push({ id:"vitrage", label:"Vitrage", debut:cursor, fin:finVitrage, duree_min:tVitrageReel, qui:quiVitrage, couleur:"#26C6DA", cmd_vitrage:dateCmdVitrage });

  cursor = addWorkMinutes(finVitrage, TAMPON_MIN);

  const tCtrl = Math.round((T.controle + T.mise_palette) * cmd.quantite);
  const finControle = addWorkMinutes(cursor, tCtrl);
  etapes.push({ id:"palette", label:"Contrôle + Palette", debut:cursor, fin:finControle, duree_min:tCtrl, qui:"Guillaume · Michel", couleur:"#66BB6A" });

  cursor = addWorkMinutes(finControle, TAMPON_MIN);

  const datesOpt = [cmd.date_panneau_porte, cmd.date_volet_roulant].filter(Boolean) as string[];
  if (datesOpt.length > 0) {
    const maxOpt = new Date(Math.max(...datesOpt.map(d => new Date(d).getTime()))).toISOString().split("T")[0];
    if (maxOpt > cursor) cursor = maxOpt;
    etapes.push({ id:"options", label:"Attente matières optionnelles", debut:finControle, fin:maxOpt, duree_min:0, qui:"—", couleur:"#FFCA28", optionnel:true });
  }

  const dateLivraisonAuPlusTot = cursor;
  const dateLivraisonSouhaitee = cmd.date_livraison_souhaitee;
  const retardJours = dateLivraisonSouhaitee
    ? Math.round((new Date(dateLivraisonAuPlusTot).getTime() - new Date(dateLivraisonSouhaitee).getTime()) / 86400000)
    : 0;

  return {
    cmdId: cmd.id, client: cmd.client, type: cmd.type, quantite: cmd.quantite,
    priorite: cmd.priorite,
    dateDemarrage: dd, etapes,
    dateLivraisonAuPlusTot, dateLivraisonSouhaitee, dateCmdVitrage,
    retardJours, enRetard: retardJours > 0, critique: retardJours > 7,
  };
}

export const C = {
  bg:"#161616", s1:"#1E1E1E", s2:"#252525",
  border:"#2E2E2E", bLight:"#3D3D3D",
  blue:"#42A5F5", orange:"#FFA726", green:"#66BB6A",
  red:"#EF5350", yellow:"#FFCA28", cyan:"#26C6DA",
  purple:"#CE93D8", teal:"#4DB6AC",
  text:"#F0F0F0", sec:"#A0A0A0", muted:"#5A5A5A",
};

export const CMAT: Record<string, string> = { PVC: C.blue, ALU: C.cyan };
export const CFAM: Record<string, string> = { frappe: C.blue, coulissant: C.green, glandage: C.purple, porte: C.orange };

// ── Transporteurs livraison ──────────────────────────────────────────────────
export const TRANSPORTEURS_LIVRAISON = [
  { id: "nous",    label: "Livraison par nous-mêmes",           c: "#42A5F5" },
  { id: "setec",   label: "Livraison par Setec",                c: "#FFA726" },
  { id: "express", label: "Livraison par transporteur express", c: "#66BB6A" },
  { id: "poseur",  label: "Livraison par un poseur",            c: "#AB47BC" },
  { id: "depot",   label: "Client récupère au dépôt",           c: "#26C6DA" },
];

// ── Tâches de fabrication ────────────────────────────────────────────────────
export const TACHES_FABRICATION = [
  // Production menuiserie
  { id: "deballage_prep",      label: "Déballage et préparation profilés",     categorie: "production", temps_unitaire: 3,   unite: "min/barre",   parallelisable: true,  competences: ["julien","laurent","mateo"] },
  { id: "coupe_lmt",           label: "Coupe LMT",                              categorie: "production", temps_unitaire: 1,   unite: "min/pièce",   parallelisable: true,  competences: ["julien","laurent","mateo"] },
  { id: "coupe_dt",            label: "Coupe double tête",                      categorie: "production", temps_unitaire: 1.5, unite: "min/pièce",   parallelisable: false, competences: ["julien"] },
  { id: "coupe_renfort",       label: "Coupe renfort acier",                    categorie: "production", temps_unitaire: 2,   unite: "min/pièce",   parallelisable: false, competences: ["mateo"] },
  { id: "soudure_pvc",         label: "Soudure cadre PVC",                      categorie: "production", temps_unitaire: 5,   unite: "min/cadre",   parallelisable: false, competences: ["michel","apprenti"] },
  { id: "premontage_coul",     label: "Pré-montage ouvrants coulissant/galandage", categorie: "production", temps_unitaire: 5, unite: "min/ouvrant", parallelisable: true, competences: ["alain","jf"] },
  { id: "montage_dorm_coul",   label: "Montage dormant coulissant",              categorie: "production", temps_unitaire: 30,  unite: "min/dormant", parallelisable: false, competences: ["alain"] },
  { id: "montage_dorm_gal",    label: "Montage dormant galandage",               categorie: "production", temps_unitaire: 60,  unite: "min/dormant", parallelisable: false, competences: ["alain"] },
  { id: "assemblage_dorm_alu", label: "Assemblage dormant frappe ALU",           categorie: "production", temps_unitaire: 10,  unite: "min/dormant", parallelisable: true,  competences: ["michel","jf","jp"] },
  { id: "assemblage_ouv_alu",  label: "Assemblage ouvrant frappe ALU",           categorie: "production", temps_unitaire: 10,  unite: "min/ouvrant", parallelisable: true,  competences: ["michel","jf","jp"] },
  { id: "ferrage",             label: "Ferrage ouvrant",                         categorie: "production", temps_unitaire: 10,  unite: "min/ouvrant", parallelisable: true,  competences: ["michel","jf","jp"] },
  { id: "vitrage_frappe",      label: "Vitrage frappes",                         categorie: "production", temps_unitaire: 10,  unite: "min/vantail",  parallelisable: true,  competences: ["jf","apprenti"] },
  { id: "vitrage_coul",        label: "Vitrage ouvrants coulissants",             categorie: "production", temps_unitaire: 20,  unite: "min/ouvrant", parallelisable: true,  competences: ["quentin","apprenti"] },
  { id: "palette",             label: "Mise sur palette",                         categorie: "production", temps_unitaire: 5,   unite: "min/pièce",   parallelisable: true,  competences: ["quentin","apprenti","guillaume"] },
  { id: "controle_qual",       label: "Contrôle qualité",                         categorie: "production", temps_unitaire: 2,   unite: "min/pièce",   parallelisable: true,  competences: [] },
  // Logistique
  { id: "dech_profils",        label: "Déchargement camion fournisseur profilés",   categorie: "logistique", temps_unitaire: 60,  unite: "min (fixe)",  parallelisable: false, competences: ["guillaume"] },
  { id: "dech_access",         label: "Déchargement camion fournisseur accessoires", categorie: "logistique", temps_unitaire: 30,  unite: "min (fixe)",  parallelisable: false, competences: ["guillaume"] },
  { id: "charg_client",        label: "Chargement camion client",                    categorie: "logistique", temps_unitaire: 120, unite: "min (fixe)",  parallelisable: false, competences: ["guillaume"] },
  { id: "rangement_stock",     label: "Rangement stock",                             categorie: "logistique", temps_unitaire: 120, unite: "min (fixe)",  parallelisable: false, competences: ["guillaume"] },
  { id: "prep_accessoires",    label: "Préparation accessoires",                     categorie: "logistique", temps_unitaire: 120, unite: "min (fixe)",  parallelisable: false, competences: ["guillaume"] },
];

export const TACHES_RITUELLES_DEFAUT = [
  { id: "nettoyage_soir",  label: "Nettoyage du soir",           fixe: true,  visible: true },
  { id: "charg_client_r",  label: "Chargement camion client",    fixe: false, visible: true },
  { id: "dech_fourn_r",    label: "Déchargement camion fournisseur", fixe: false, visible: true },
  { id: "rangement_r",     label: "Rangement stock",             fixe: false, visible: true },
  { id: "maintenance",     label: "Maintenance",                  fixe: false, visible: true },
  { id: "prep_access_r",   label: "Préparation accessoires",     fixe: false, visible: true },
];

export const TACHES_ISULA = [
  { id: "dech_vitrage",  label: "Déchargement camion fournisseur vitrage" },
  { id: "coupe_bottero", label: "Coupe Bottero" },
  { id: "coupe_lisec",   label: "Coupe Lisec" },
  { id: "coupe_intercal",label: "Coupe intercalaire" },
  { id: "pose_intercal", label: "Pose intercalaires" },
  { id: "but_tammi",     label: "Mise en place but et Tammi" },
  { id: "laveuse",       label: "Laveuse" },
  { id: "mise_intercal", label: "Mise intercalaire sur vitrage" },
  { id: "presse",        label: "Presse" },
  { id: "gaz",           label: "Gaz" },
  { id: "enduction",     label: "Enduction" },
  { id: "controle_isula",label: "Contrôle qualité" },
  { id: "chariot",       label: "Mise sur chariot" },
];

// Compétences préférentielles par défaut (configurables depuis l'app)
export const COMPETENCES_DEFAUT: Record<string, string[]> = {
  "julien":    ["coupe_lmt", "coupe_dt"],
  "laurent":   ["coupe_lmt", "coupe_renfort"],
  "mateo":     ["coupe_lmt", "coupe_renfort"],
  "alain":     ["montage_dorm_coul", "montage_dorm_gal", "premontage_coul"],
  "michel":    ["assemblage_dorm_alu", "assemblage_ouv_alu", "soudure_pvc"],
  "jf":        ["assemblage_dorm_alu", "assemblage_ouv_alu", "vitrage_frappe"],
  "quentin":   ["vitrage_coul", "palette"],
  "apprenti":  ["soudure_pvc", "vitrage_frappe", "palette"],
  "guillaume": ["dech_profils", "dech_access", "charg_client", "rangement_stock", "prep_accessoires"],
  "ali":       [],
  "momo":      [],
  "bruno":     [],
  "jp":        ["assemblage_dorm_alu", "assemblage_ouv_alu", "vitrage_coul", "montage_dorm_coul"],
};

// Équipe pour affichage atelier (avec dates naissance pour anniversaires)
export const EQUIPE_ANNIVERSAIRES: Array<{ id: string; nom: string; naissance: string }> = [
  { id: "guillaume", nom: "Guillaume",     naissance: "" },
  { id: "momo",      nom: "Momo",          naissance: "" },
  { id: "bruno",     nom: "Bruno",         naissance: "" },
  { id: "ali",       nom: "Ali",           naissance: "" },
  { id: "jp",        nom: "Jean-Pierre",   naissance: "" },
  { id: "jf",        nom: "Jean-François", naissance: "" },
  { id: "michel",    nom: "Michel",        naissance: "" },
  { id: "alain",     nom: "Alain",         naissance: "" },
  { id: "francescu", nom: "Francescu",     naissance: "" },
  { id: "julien",    nom: "Julien",        naissance: "" },
  { id: "laurent",   nom: "Laurent",       naissance: "" },
];
