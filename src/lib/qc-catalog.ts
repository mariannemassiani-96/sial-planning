// ── Catalogue des contrôles qualité par poste de travail ────────────────────
// Source : section 8 SPEC_PLANNING_SIAL_ISULA.md

export interface QCCheckDef {
  qcRef: string;
  label: string;
  isBlocking: boolean;
  numericValue?: boolean; // champ de saisie numérique (ex: conductivité A4)
}

/** Map workPostId → liste de contrôles QC associés */
export const QC_CATALOG: Record<string, QCCheckDef[]> = {
  // ── SIAL Coupe & Prépa ──────────────────────────────────────────────────
  C1: [
    { qcRef: "QC-M01-A", label: "Déballage profils — référence conforme",   isBlocking: true  },
    { qcRef: "QC-M01-B", label: "Déballage profils — coloris conforme",     isBlocking: true  },
    { qcRef: "QC-M01-C", label: "Déballage profils — état sans défaut",     isBlocking: true  },
  ],
  C3: [
    { qcRef: "QC-M01-D", label: "Préparation profils — sens correct",       isBlocking: true  },
    { qcRef: "QC-M01-E", label: "Préparation profils — joints en place",    isBlocking: true  },
    { qcRef: "QC-M02-1", label: "Coupe — longueur conforme",                isBlocking: true  },
    { qcRef: "QC-M02-2", label: "Coupe — qualité de coupe",                 isBlocking: true  },
    { qcRef: "QC-M02-3", label: "Coupe — mise en chariot correcte",         isBlocking: true  },
  ],
  C6: [
    { qcRef: "QC-M03-2", label: "Qualité soudure PVC conforme",             isBlocking: true  },
  ],
  // ── SIAL Montage Coulissants / Galandages ───────────────────────────────
  M1: [
    { qcRef: "QC-M01-F", label: "Prépa ouvrants coulissants conforme",      isBlocking: true  },
    { qcRef: "QC-M03-1", label: "Équerrage dormant — 100% OF",              isBlocking: true  },
    { qcRef: "QC-M03-A", label: "Options coulissant — isolation",           isBlocking: true  },
    { qcRef: "QC-M03-B", label: "Options coulissant — roulants",            isBlocking: true  },
    { qcRef: "QC-M03-C", label: "Options coulissant — gâches",              isBlocking: true  },
    { qcRef: "QC-M03-D", label: "Options coulissant — étanchéité",          isBlocking: true  },
    { qcRef: "QC-M03-E", label: "Aspect dormant",                           isBlocking: false },
  ],
  M2: [
    { qcRef: "QC-M01-F", label: "Prépa ouvrants galandage conforme",        isBlocking: true  },
    { qcRef: "QC-M03-1", label: "Équerrage dormant — 100% OF",              isBlocking: true  },
    { qcRef: "QC-M03-A", label: "Options galandage — isolation",            isBlocking: true  },
    { qcRef: "QC-M03-B", label: "Options galandage — roulants",             isBlocking: true  },
    { qcRef: "QC-M03-C", label: "Options galandage — gâches",               isBlocking: true  },
    { qcRef: "QC-M03-D", label: "Options galandage — étanchéité",           isBlocking: true  },
    { qcRef: "QC-M03-E", label: "Aspect dormant",                           isBlocking: false },
  ],
  M3: [
    { qcRef: "QC-M03-1", label: "Équerrage dormant porte — 100% OF",       isBlocking: true  },
    { qcRef: "QC-M03-E", label: "Aspect dormant porte",                     isBlocking: false },
  ],
  // ── SIAL Montage Frappes ────────────────────────────────────────────────
  F1: [
    { qcRef: "QC-M03-1", label: "Équerrage dormant frappe — 100% OF",      isBlocking: true  },
  ],
  F2: [
    { qcRef: "QC-M05",   label: "Ferrage conforme",                         isBlocking: false },
  ],
  F3: [
    { qcRef: "QC-M06",   label: "Fonctionnement mise en bois",              isBlocking: false },
  ],
  // ── SIAL Vitrage & Expédition ───────────────────────────────────────────
  V1: [
    { qcRef: "QC-M07-A", label: "Vitrage — sens correct",                   isBlocking: true  },
    { qcRef: "QC-M07-1", label: "Vitrage — calage DTU conforme",            isBlocking: true  },
    { qcRef: "QC-M07-2", label: "Vitrage — propreté",                       isBlocking: true  },
  ],
  V2: [
    { qcRef: "QC-M03-F", label: "Étiquette CE posée",                       isBlocking: true  },
    { qcRef: "QC-M03-G", label: "Étiquette WindowIT posée",                 isBlocking: true  },
    { qcRef: "QC-M03-H", label: "Étiquette expédition posée",               isBlocking: true  },
    { qcRef: "QC-M08-1", label: "Contrôle final pièce",                     isBlocking: true  },
    { qcRef: "QC-M08-2", label: "Contrôle final étiquette CE",              isBlocking: true  },
  ],
  // ── ISULA Vitrage isolant ───────────────────────────────────────────────
  I1: [
    { qcRef: "A1-verre",        label: "Réception verre — état, référence, lot, épaisseur",          isBlocking: true  },
    { qcRef: "A1-intercalaire", label: "Réception intercalaires — type, largeur, lot",               isBlocking: true  },
    { qcRef: "A1-dessiccant",   label: "Réception dessiccant — péremption, lot, ouverture",          isBlocking: true  },
    { qcRef: "A1-mastics",      label: "Réception mastics PU A+B — lot, péremption",                 isBlocking: true  },
    { qcRef: "A2",              label: "Stockage — hygrométrie, température, propreté",              isBlocking: false },
  ],
  I2: [
    { qcRef: "A4", label: "Lavage verre — conductivité µS, pH, température eau", isBlocking: true, numericValue: true },
  ],
  I6: [
    { qcRef: "A6", label: "Injection argon — % argon, test échantillon, lot",   isBlocking: true  },
    { qcRef: "A8", label: "Mastic secondaire — ratio A/B, poids, hygrométrie", isBlocking: false },
  ],
};

/** Toutes les defs, indexées par qcRef pour lookup rapide */
const _flat = new Map<string, QCCheckDef>(
  Object.values(QC_CATALOG).flat().map((d) => [d.qcRef, d])
);

export function getQCDef(qcRef: string): QCCheckDef | undefined {
  return _flat.get(qcRef);
}

export function isCheckBlocking(qcRef: string): boolean {
  return _flat.get(qcRef)?.isBlocking ?? false;
}
