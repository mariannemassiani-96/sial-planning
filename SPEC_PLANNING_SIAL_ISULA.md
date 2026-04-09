# SPEC COMPLÈTE — Planning industriel SIAL + ISULA
## Document de référence pour Claude Code — sial-planning
*Basé sur : Flux_atelier.docx, capcite_pro.docx, Process_Fab_et_qualité_odoo.docx, Listes_controles_atelier.docx, Certification_VISTA_2026.docx, DOSSIER_PROJET_ODOO_PLANNING_FAB.docx, MANUEL_ATELIER_qualité.docx, Cahier_des_charges.docx + données encodées app*

---

## STACK & CONTEXTE

- Next.js 14 App Router + Prisma + NextAuth + TypeScript
- PostgreSQL OVH 37.187.250.4 · base sial-planning · user sial_app
- Thème dark #0D1B2A
- 2 utilisateurs : ADMIN (Marianne) + OPERATEUR (Ange-Joseph)
- Suppression commandes réservée à Marianne uniquement
- PRO F2 = vérité technique. L'appli orchestre le flux, ne recalcule rien de technique.

---

## PRINCIPE DIRECTEUR LEAN

Flux tiré par la date chantier. Chaque action en atelier part de la date de livraison et remonte en arrière. Ange-Joseph pilote des postes, pas des commandes globales. Chaque étape cochée = traçabilité + données pour amélioration continue.

---

## 1. MODÈLE DE DONNÉES PRISMA — COMPLET

```prisma
// ─── OPÉRATEURS ───────────────────────────────────────────────
model Operator {
  id        String   @id @default(cuid())
  name      String
  weekHours Float
  posts     String[]
  active    Boolean  @default(true)
  absences  OperatorAbsence[]
  taskAssignments TaskAssignment[]
}

model OperatorAbsence {
  id         String   @id @default(cuid())
  operatorId String
  date       DateTime
  reason     String?
  operator   Operator @relation(fields: [operatorId], references: [id])
}

// ─── POSTES DE TRAVAIL ────────────────────────────────────────
// SIAL Coupe/Prépa : C1 C2 C3 C4 C5 C6
// SIAL Montage Coulissants/Galandages/Portes : M1 M2 M3
// SIAL Montage Frappes : F1 F2 F3
// SIAL Vitrage + Expédition : V1 V2
// ISULA Vitrage isolant : I1 I2 I3 I4 I5 I6 I7 I8

model WorkPost {
  id              String  @id
  label           String
  atelier         Atelier
  capacityMinDay  Int
  defaultOperators String[]
  tasks           ProductionTask[]
}

enum Atelier {
  SIAL
  ISULA
}

// ─── COMMANDES ────────────────────────────────────────────────
model Order {
  id              String      @id @default(cuid())
  refProF2        String      @unique
  refChantier     String
  clientName      String
  deliveryDate    DateTime
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
  status          OrderStatus @default(A_LANCER)
  items           FabItem[]
  bufferStocks    BufferStock[]
  notes           String?
}

enum OrderStatus {
  A_LANCER
  EN_COURS
  ATTENTE_VITRAGE
  ATTENTE_IGU
  PRET_LIVRAISON
  LIVRE
  SUSPENDU
}

// ─── ARTICLES DE FABRICATION ──────────────────────────────────
model FabItem {
  id              String          @id @default(cuid())
  orderId         String
  menuiserieType  MenuiserieType
  quantity        Int
  label           String
  isSpecial       Boolean         @default(false)
  specialType     SpecialType?
  matiere         Matiere
  widthMm         Int?
  heightMm        Int?
  order           Order           @relation(fields: [orderId], references: [id])
  tasks           ProductionTask[]
  qcChecks        QCCheck[]
}

enum MenuiserieType {
  OB1_PVC OB2_PVC OF1_PVC OF2_PVC FIXE_PVC PF1_PVC PF2_PVC
  OB1_ALU OB2_ALU OF1_ALU OF2_ALU FIXE_ALU PF1_ALU PF2_ALU
  P1_ALU P2_ALU
  C2V2R C3V3R C4V4R C4V2R
  G1V1R G2V1R G2V2R G3V3R G4V2R
  HORS_STANDARD INTERVENTION_CHANTIER
}

enum SpecialType {
  COULISSANT_GRAND_FORMAT
  GALANDAGE_GRAND_FORMAT
  HORS_NORME
  INTERVENTION
}

enum Matiere {
  ALU
  PVC
  ALU_PVC
}

// ─── TÂCHES DE PRODUCTION ─────────────────────────────────────
model ProductionTask {
  id               String       @id @default(cuid())
  fabItemId        String
  workPostId       String
  label            String
  estimatedMinutes Int
  actualMinutes    Int?
  status           TaskStatus   @default(PENDING)
  scheduledDate    DateTime?
  startedAt        DateTime?
  completedAt      DateTime?
  blockedReason    String?
  order            Int
  isBlocking       Boolean      @default(false)
  assignments      TaskAssignment[]
  qcChecks         QCCheck[]
  fabItem          FabItem      @relation(fields: [fabItemId], references: [id])
  workPost         WorkPost     @relation(fields: [workPostId], references: [id])
}

enum TaskStatus {
  PENDING
  IN_PROGRESS
  DONE
  BLOCKED
  SKIPPED
}

model TaskAssignment {
  id         String         @id @default(cuid())
  taskId     String
  operatorId String
  task       ProductionTask @relation(fields: [taskId], references: [id])
  operator   Operator       @relation(fields: [operatorId], references: [id])
}

// ─── CONTRÔLES QUALITÉ ────────────────────────────────────────
model QCCheck {
  id          String    @id @default(cuid())
  fabItemId   String
  taskId      String?
  qcRef       String
  label       String
  result      QCResult?
  value       String?
  checkedAt   DateTime?
  checkedBy   String?
  actionTaken String?
  fabItem     FabItem   @relation(fields: [fabItemId], references: [id])
}

enum QCResult {
  OK
  NOK
  REPRISE
  REBUT
}

// ─── STOCKS TAMPONS ───────────────────────────────────────────
model BufferStock {
  id         String     @id @default(cuid())
  orderId    String?
  type       BufferType
  quantity   Float
  unit       String
  updatedAt  DateTime   @updatedAt
  order      Order?     @relation(fields: [orderId], references: [id])
}

enum BufferType {
  PROFILES_COUPES
  VITRAGES_ISULA
  OUVRANTS_VITRES
  ACCESSOIRES_PREPARES
  PROFILES_BRUTS
  VERRE_BRUT_ISULA
}

// ─── NON-CONFORMITÉS ─────────────────────────────────────────
model NonConformity {
  id          String     @id @default(cuid())
  fabItemId   String
  qcRef       String?
  description String
  severity    NCSeverity
  status      NCStatus   @default(DETECTED)
  cause       String?
  action      String?
  resolvedAt  DateTime?
  createdAt   DateTime   @default(now())
}

enum NCSeverity { MINOR MAJOR BLOCKING }
enum NCStatus { DETECTED IN_QUARANTINE UNDER_REPAIR RESOLVED SCRAPPED }
```

---

## 2. TEMPS UNITAIRES — FORMULES AUTOMATIQUES

### Constantes (ne pas modifier)
```typescript
export const TEMPS = {
  coupe_profil: 1,           // min/pièce LMT
  coupe_dt: 1.5,             // min/pièce double tête
  coupe_renfort: 2,          // min/pièce acier
  soudure_pvc: 5,            // min/cadre
  poincon_alu: 10,           // min/cadre
  pose_rails: 10,            // min/dormant
  montage_dormant_coul: 30,  // min/dormant
  montage_dormant_gal: 60,   // min/dormant (GRAND FORMAT > 4m : x multiplicateur)
  ferrage: 10,               // min/ouvrant
  prep_dormant: 5,           // min/pièce
  mise_en_bois: 5,           // min/pièce
  vitrage_frappe: 10,        // min/vantail
  vitrage_coul: 20,          // min/ouvrant
  controle: 2,               // min/pièce
  palette: 5,                // min/pièce
  lancement_matin: 10,       // min fixe/jour
  nettoyage_soir: 15,        // min fixe/jour
  ouvrant_coul_prep: 5,      // min/ouvrant
}

// Multiplicateur grand format (coulissants/galandages > 4m)
export function specialMultiplier(widthMm: number): number {
  if (widthMm >= 6000) return 4.0
  if (widthMm >= 5000) return 3.0
  if (widthMm >= 4000) return 2.0
  return 1.0
}

// Formules par famille
export function calcCoupe(lmt: number, dt: number, renfort: number, qty: number) {
  return (lmt * TEMPS.coupe_profil + dt * TEMPS.coupe_dt + renfort * TEMPS.coupe_renfort) * qty
}
export function calcFrappes(ouvrants: number, qty: number) {
  return (TEMPS.ferrage * ouvrants + TEMPS.prep_dormant + TEMPS.mise_en_bois +
          TEMPS.vitrage_frappe * ouvrants + TEMPS.controle + TEMPS.palette) * qty
}
export function calcCoulissant(dormants: number, ouvrants: number, qty: number, widthMm = 0) {
  const base = (TEMPS.pose_rails * dormants + TEMPS.montage_dormant_coul * dormants +
                TEMPS.ouvrant_coul_prep * ouvrants) * qty
  return base * specialMultiplier(widthMm)
}
export function calcGalandage(dormants: number, ouvrants: number, qty: number, widthMm = 0) {
  const base = (TEMPS.montage_dormant_gal * dormants + TEMPS.ouvrant_coul_prep * ouvrants) * qty
  return base * specialMultiplier(widthMm)
}
export function calcVitrageOV(ouvrants: number, qty: number) {
  return (TEMPS.vitrage_coul * ouvrants + TEMPS.palette) * qty
}
// HORS_STANDARD et INTERVENTION : temps saisis manuellement par étape
```

### Catalogue menuiseries (données LMT / DT / Renfort / Ouvrants / Dormants)
```typescript
export const CATALOGUE = {
  // PVC Frappes
  OB1_PVC: { lmt:8, dt:0, renfort:8, dormants:1, ouvrants:1 },
  OF1_PVC: { lmt:8, dt:0, renfort:8, dormants:1, ouvrants:1 },
  OB2_PVC: { lmt:10, dt:1, renfort:10, dormants:1, ouvrants:2 },
  OF2_PVC: { lmt:10, dt:1, renfort:10, dormants:1, ouvrants:2 },
  FIXE_PVC: { lmt:4, dt:0, renfort:4, dormants:1, ouvrants:0 },
  PF1_PVC: { lmt:8, dt:0, renfort:8, dormants:1, ouvrants:1 },
  PF2_PVC: { lmt:10, dt:1, renfort:10, dormants:1, ouvrants:2 },
  // ALU Frappes
  OB1_ALU: { lmt:8, dt:0, renfort:0, dormants:1, ouvrants:1 },
  OF1_ALU: { lmt:8, dt:0, renfort:0, dormants:1, ouvrants:1 },
  OB2_ALU: { lmt:10, dt:1, renfort:0, dormants:1, ouvrants:2 },
  OF2_ALU: { lmt:10, dt:1, renfort:0, dormants:1, ouvrants:2 },
  FIXE_ALU: { lmt:8, dt:0, renfort:0, dormants:1, ouvrants:0 },
  PF1_ALU: { lmt:8, dt:0, renfort:0, dormants:1, ouvrants:1 },
  PF2_ALU: { lmt:10, dt:1, renfort:0, dormants:1, ouvrants:2 },
  // Portes ALU
  P1_ALU: { lmt:11, dt:2, renfort:0, dormants:1, ouvrants:1 },
  P2_ALU: { lmt:19, dt:3, renfort:0, dormants:1, ouvrants:2 },
  // Coulissants ALU
  C2V2R: { lmt:12, dt:3, renfort:0, dormants:1, ouvrants:2 },
  C3V3R: { lmt:16, dt:4, renfort:0, dormants:1, ouvrants:3 },
  C4V4R: { lmt:29, dt:5, renfort:0, dormants:2, ouvrants:4 },
  C4V2R: { lmt:21, dt:3, renfort:0, dormants:1, ouvrants:4 },
  // Galandages ALU
  G1V1R: { lmt:12, dt:3, renfort:0, dormants:1, ouvrants:1 },
  G2V1R: { lmt:17, dt:5, renfort:0, dormants:1, ouvrants:2 },
  G2V2R: { lmt:15, dt:4, renfort:0, dormants:1, ouvrants:2 },
  G3V3R: { lmt:20, dt:9, renfort:0, dormants:1, ouvrants:3 },
  G4V2R: { lmt:18, dt:7, renfort:0, dormants:1, ouvrants:4 },
}
```

---

## 3. POSTES RÉELS ET CAPACITÉS

### SIAL — Coupe & Prépa
| Code | Intitulé | Opérateurs | Cap. min/j |
|------|----------|-----------|------------|
| C1 | Déchargement + déballage | Laurent + Julien + Apprenti | 1620 |
| C2 | Préparation barres | Laurent + Julien + Apprenti | 1620 |
| C3 | Coupe LMT 65 | Laurent + Julien + Apprenti | 1620 |
| C4 | Coupe double tête | Julien seul | 540 |
| C5 | Coupe renfort acier | Laurent | 540 |
| C6 | Soudure PVC | Julien | 540 |

### SIAL — Montage (rotation quotidienne)
| Code | Intitulé | Opérateurs | Cap. min/j |
|------|----------|-----------|------------|
| M1 | Dormants coulissants | Alain + JP + Michel (rotation) | 1080 |
| M2 | Dormants galandage | Alain + JP + Michel (rotation) | 1080 |
| M3 | Portes ALU | Alain + JP + Michel (rotation) | 1080 |
| F1 | Dormants frappe ALU | Alain + JP + Michel (rotation) | 1080 |
| F2 | Ouvrants frappe + ferrage | Alain + JP + Michel (rotation) | 1080 |
| F3 | Mise en bois + contrôle | Alain + JP + Michel (rotation) | 1080 |

IMPORTANT : Les postes M (Coulissants/Gal/Portes) et F (Frappes) alternent chaque jour.
Ange-Joseph définit le mode du jour via un toggle visible sur le dashboard.

### SIAL — Vitrage & Expédition
| Code | Intitulé | Opérateurs | Cap. min/j |
|------|----------|-----------|------------|
| V1 | Vitrage menuiserie | JF + Momo/Guillaume (renforts) | 480 |
| V2 | Emballage + expédition | JF + Laurent (soutien) | 480 |

### ISULA — Vitrage isolant (3 jours/semaine : lundi, mardi, jeudi UNIQUEMENT)
| Code | Intitulé | Opérateurs | Cap. min/j |
|------|----------|-----------|------------|
| I1 | Réception verre | Momo + Guillaume | 840 |
| I2 | Coupe float/feuilleté/formes | Momo + Guillaume | 840 |
| I3 | Coupe intercalaire | Momo | 420 |
| I4 | Butyle | Momo | 420 |
| I5 | Assemblage | Momo + Guillaume | 840 |
| I6 | Gaz + scellement | Momo + Guillaume | 840 |
| I7 | Contrôle final CEKAL | Guillaume | 420 |
| I8 | Sortie chaîne + rangement | Momo + Guillaume + Bruno | 1050 |

Mercredi et vendredi : capacité ISULA = 0. À modéliser dans le calcul des dates.

---

## 4. OPÉRATEURS NOMINATIFS

| Prénom | Heures/semaine | Postes principaux |
|--------|---------------|-------------------|
| Laurent | 39h | C1 C2 C3 C5 V2 (soutien) |
| Julien | 39h | C1 C2 C3 C4 C6 |
| Alain | 30h | M1 M2 M3 F1 F2 F3 (rotation) |
| Jean-Pierre | 36h | M1 M2 M3 F1 F2 F3 (rotation) |
| Michel | 36h | M1 M2 M3 F1 F2 F3 + CQ final |
| Jean-François | 39h | V1 V2 |
| Guillaume | 39h | I1 I2 I5 I6 I7 I8 + V1 (renfort) |
| Momo | 39h | I1 I2 I3 I4 I5 I6 I8 + V1 (renfort) |
| Apprenti | 35h | C1 C2 C3 (soutien coupe) |

---

## 5. CHÂSSIS SPÉCIAUX (GRAND FORMAT > 4m)

### Détection automatique
- isSpecial = true si widthMm > 4000 pour coulissants ou galandages
- isSpecial = true si specialType = HORS_NORME ou INTERVENTION

### Règle de saisie
Pour tout item isSpecial = true :
- Tâches NON générées automatiquement
- Interface constructeur d'étapes : nom poste (liste + saisie libre) + durée (min ou h) + ordre drag&drop
- Temps total affiché en heures

### Règle de blocage poste
- Poste M1 (coulissant grand format) ou M2 (galandage grand format) marqué "réservé" pendant la durée estimée
- Aucune autre commande standard sur ce poste pendant ce temps
- Commandes standard décalées affichées en orange "Décalé — grand format en cours"
- Alerte si 2 spéciaux sur le même poste le même jour

### Affichage
- Badge amber "SPÉCIAL" sur toutes les vues
- Section dédiée "Pièces spéciales cette semaine" en haut du dashboard
- Bloc plus large dans la vue calendrier (proportionnel au temps total estimé)

---

## 6. GRANDS FORMATS ISULA

### Définition
IGU grand format : largeur > 2000mm OU hauteur > 3000mm

### Impact
- Postes I2 + I5 + I6 mobilisés en totalité
- Capacité ISULA divisée par 2 pendant fabrication
- Durée = saisie manuelle
- Tampon ISULA → livraison passe de 4 à 6 jours ouvrés

---

## 7. TAMPONS OFFICIELS ET CHEMIN CRITIQUE

| Tampon | Valeur | Modélisation |
|--------|--------|-------------|
| Entre chaque étape | 4h (240 min) | Ajouté automatiquement entre tâches séquentielles |
| Coupe SIAL → Livraison | 15 jours ouvrés | Date démarrage coupe = livraison - 15j |
| Vitrage ISULA standard → Livraison | 4 jours ouvrés | Date démarrage ISULA = livraison - 4j |
| Vitrage ISULA grand format → Livraison | 6 jours ouvrés | Date démarrage ISULA = livraison - 6j |

### Stocks tampons (seuils à surveiller)
| Type | Min | Cible | Max | Unité |
|------|-----|-------|-----|-------|
| Profilés coupés (zone coupe→montage) | 1 | 2 | 4 | chariots (80 pcs/chariot) |
| Vitrages ISULA prêts | 2 | 3 | 6 | chariots (15 vit./chariot) |
| Ouvrants coulissants vitrés | 2 | 4 | 10 | palettes (6 ouv./palette) |
| Accessoires préparés par poste | 1 | 3 | 5 | jours |
| Profilés bruts magasin | 2 | 3 | 4 | semaines |
| Verre brut ISULA | 100 | 250 | 400 | m² |

---

## 8. CONTRÔLES QUALITÉ INTÉGRÉS

### SIAL — Plan de contrôle V4
| Ref | Étape | Déclencheur | Bloquant |
|-----|-------|-------------|---------|
| QC-M01-A/B/C | Déballage profils (référence, coloris, état) | Avant démarrage C1 | OUI |
| QC-M01-D/E | Préparation profils (sens, joints) | Avant C3 | OUI |
| QC-M02-1/2/3 | Coupe (longueur, qualité, mise en chariot) | Début série + périodique | OUI |
| QC-M01-F | Prépa ouvrants coulissants/galandages | Avant M1/M2 | OUI |
| QC-M03-1 | Équerrage dormant | 100% OF | OUI |
| QC-M03-A à D | Options coulissant (isolation, roulants, gâches) | 100% | OUI |
| QC-M03-E | Aspect dormant | 100% | NON |
| QC-M03-F/G/H | Étiquettes CE + WindowIT + expédition | Avant sortie | OUI |
| QC-M03-2 | Qualité soudure PVC | 100% OF | OUI |
| QC-M05 | Ferrage conforme | 100% | NON |
| QC-M06 | Fonctionnement mise en bois | 100% | NON |
| QC-M07-A/1/2 | Vitrage (sens, calage DTU, propreté) | 100% | OUI |
| QC-M08-1/2 | Contrôle final + étiquette CE | Avant expédition | OUI |

### ISULA — Plan de contrôle CEKAL
| Ref | Étape | Fréquence | Bloquant |
|-----|-------|-----------|---------|
| A1-verre | Réception verre (état, référence, lot, épaisseur) | Chaque livraison | OUI |
| A1-intercalaire | Réception intercalaires (type, largeur, lot) | Chaque livraison | OUI |
| A1-dessiccant | Réception dessiccant (péremption, lot, ouverture) | Chaque livraison | OUI |
| A1-mastics | Réception mastics PU A+B (lot, péremption) | Chaque livraison | OUI |
| A2 | Stockage (hygrométrie, température, propreté) | Quotidien | NON |
| A4 | Lavage verre (conductivité µS, pH, température eau) | Quotidien CRITIQUE | OUI |
| A6 | Injection argon (% argon, test échantillon, lot) | 100% | OUI |
| A8 | Mastic secondaire (ratio A/B, poids, hygrométrie) | Quotidien | NON |

### Règle d'affichage QC
- Contrôles bloquants : le passage à l'étape suivante est verrouillé tant que le QC n'est pas validé OK
- Badge rouge "QC en attente" sur la tâche
- Si NOK : création automatique NonConformity (statut DETECTED)
- Ange-Joseph saisit OK/NOK + note libre. Pour les valeurs numériques (conductivité, etc.) : champ de saisie numérique.

---

## 9. UX — VUES ET NAVIGATION (3 vues maximum)

### Vue 1 : Dashboard matin (page par défaut à l'ouverture de session)

**En-tête fixe**
- Toggle "Mode du jour" : [Coulissants / Gal / Portes] ↔ [Frappes]
- Date du jour + jours ISULA actifs/inactifs clairement indiqués

**Section "Alertes" (en haut, rouge/orange)**
- Commandes en retard (rouge) — affiche combien de jours de retard
- Châssis spéciaux actifs cette semaine (amber) — liste avec poste et durée
- Commandes ATTENTE_VITRAGE depuis > seuil (orange)
- Stocks tampons sous le minimum (rouge)

**Section "Aujourd'hui — SIAL"**
- Par poste actif selon le mode du jour : commandes à traiter, quantités, opérateur assigné
- Bouton unique et visible : "Marquer terminé" par lot
- Bouton "Signaler un problème" → statut BLOCKED + champ texte

**Section "Aujourd'hui — ISULA"**
- Visible uniquement lundi, mardi, jeudi
- Postes I1 à I8 avec commandes en cours
- Niveaux stocks tampons en temps réel (barres min/cible/max)

**Section "Prêt à livrer"**
- Commandes PRET_LIVRAISON avec date prévue expédition

### Vue 2 : Planning semaine
- Calendrier 5 jours × 2 ateliers (onglets SIAL / ISULA)
- Code couleur : gris=À lancer, bleu=En cours, amber=Spécial, orange=Attente vitrage, vert=Prêt, rouge=Retard
- Clic sur une carte → détail commande
- Drag & drop pour replanifier une tâche sur un autre jour
- Indicateur de charge par poste (barre de capacité utilisée vs disponible)

### Vue 3 : Détail commande
- En-tête : ref chantier, client, date livraison, statut, jours restants (code couleur : vert>5j / orange 2-5j / rouge<2j)
- Barre de progression globale par étapes
- Par FabItem : liste tâches avec statut, temps estimé vs réel, opérateurs
- Pour les spéciaux : constructeur d'étapes activé
- Historique QC checks avec résultats

### Règles UX non négociables
- Boutons avec texte explicite ("Marquer terminé", "Affecter à...", "Signaler un problème", "Passer à l'étape suivante")
- Jamais d'icônes seules pour les actions principales
- Confirmation visuelle immédiate (toast) après chaque action
- Statuts en français : "À lancer", "En cours", "En attente vitrage", "En attente IGU", "Prêt à livrer", "Livré", "Bloqué"
- Maximum 2 clics pour toute action courante

---

## 10. DROITS UTILISATEURS

| Action | ADMIN (Marianne) | OPERATEUR (Ange-Joseph) |
|--------|-----------------|------------------------|
| Voir toutes les vues | OUI | OUI |
| Créer/modifier une commande | OUI | OUI |
| Supprimer une commande | OUI | NON |
| Saisir tâches spéciaux | OUI | OUI |
| Valider les QC | OUI | OUI |
| Voir statistiques (réel vs estimé) | OUI | NON |
| Gérer opérateurs et absences | OUI | NON |
| Modifier tampons et capacités | OUI | NON |

---

## 11. ORDRE D'IMPLÉMENTATION RECOMMANDÉ

1. Migrer le schéma Prisma (tous les nouveaux modèles ci-dessus)
2. Seeder les données de base : WorkPosts, Operators, Catalogue menuiseries avec LMT/DT/Renfort
3. Implémenter calcul automatique des tâches pour types standards (formules section 2)
4. Implémenter la saisie manuelle pour les spéciaux (constructeur d'étapes)
5. Construire le Dashboard matin (Vue 1) — PRIORITÉ MAXIMALE pour Ange-Joseph
6. Construire le Planning semaine (Vue 2)
7. Construire le Détail commande (Vue 3)
8. Intégrer les QC checks dans le flux des tâches
9. Ajouter les alertes stocks tampons
10. Statistiques admin (vue Marianne uniquement)

---

## 12. LANCEMENT CLAUDE CODE

```bash
cd C:\Users\Marianne\sial-planning
git pull
claude --dangerously-skip-permissions
```

Premier prompt à donner à Claude Code après lancement :
"Commence par migrer le schéma Prisma selon la spec SPEC_PLANNING_SIAL_ISULA.md (section 1), puis génère le seeder pour les WorkPosts, Operators et Catalogue menuiseries (sections 3 et 4). Ensuite construis le composant Dashboard matin (Vue 1, section 9) en priorité absolue."

---

## 13. SKILL KAIZEN:ANALYSE — UTILISATION DANS LE PROJET

Le skill `/analyse` (kaizen:analyse) est installé dans Claude Code et doit être utilisé activement à 3 moments clés du développement et de l'exploitation de l'appli.

---

### Utilisation 1 — VALUE STREAM MAPPING du flux de planification

**Quand l'utiliser :** Avant de construire ou refondre une vue (dashboard matin, planning semaine).

**Commande à lancer dans Claude Code :**
```
/analyse flux de planification SIAL : commande PRO F2 → coupe → montage → vitrage ISULA → assemblage final → expédition chantier
```

**Ce que ça produira :**
- Cartographie de chaque étape avec temps de traitement vs temps d'attente
- Identification des goulots : stock tampon coupe→montage, synchronisation ISULA, attente vitrage grand format
- Calcul du taux d'efficacité réel du flux (valeur ajoutée / temps total)
- Proposition d'état futur optimisé

**Données à alimenter dans l'analyse :**
- Tampons officiels : 4h entre étapes, 15j coupe→livraison, 4j ISULA→livraison
- Capacités postes (section 3 de la spec)
- Temps d'attente réels constatés (ATTENTE_VITRAGE, grands formats)

---

### Utilisation 2 — MUDA ANALYSIS sur les données de production

**Quand l'utiliser :** Une fois l'appli en production, sur les données réelles (temps estimé vs réel, NC, dépassements).

**Commande à lancer dans Claude Code :**
```
/analyse codebase for inefficiencies
```
ou, sur les données métier :
```
/analyse flux atelier SIAL pour identification des gaspillages : dépassements de temps par poste, taux NC, attentes inter-ateliers
```

**Les 7 Mudas appliqués à SIAL+ISULA :**

| Muda | Application SIAL+ISULA | Indicateur dans l'appli |
|------|----------------------|------------------------|
| Surproduction | Fabrication de pièces avant que l'IGU soit commandé | FabItems créés sans date ISULA planifiée |
| Attente | Cadres SIAL prêts mais IGU pas livrés | Durée en statut ATTENTE_VITRAGE |
| Transport | Chariots profilés coupés déplacés plusieurs fois | Stocks tampons sous le min trop souvent |
| Sur-traitement | QC redondants, re-contrôles inutiles | Taux QC NOK → REPRISE par poste |
| Stock | Grands formats bloquant un poste sans avancement | TaskStatus BLOCKED > 4h |
| Mouvement | Alain change de poste M→F sans anticipation | Toggle mode du jour non défini le matin |
| Défauts | NC rebut vs NC reprise par type de châssis | NonConformity.severity par MenuiserieType |

**Requête SQL de base à générer dans Claude Code pour alimenter l'analyse :**
```sql
-- Temps réel vs estimé par poste
SELECT workPostId, 
       AVG(actualMinutes - estimatedMinutes) as ecart_moyen,
       COUNT(*) FILTER (WHERE actualMinutes > estimatedMinutes * 1.2) as depassements
FROM ProductionTask WHERE status = 'DONE'
GROUP BY workPostId ORDER BY ecart_moyen DESC;

-- Durée moyenne en ATTENTE_VITRAGE
SELECT AVG(EXTRACT(EPOCH FROM (updatedAt - createdAt))/3600) as heures_attente
FROM Order WHERE status = 'ATTENTE_VITRAGE';

-- Taux NC par type de menuiserie
SELECT fi.menuiserieType, nc.severity, COUNT(*) 
FROM NonConformity nc JOIN FabItem fi ON nc.fabItemId = fi.id
GROUP BY fi.menuiserieType, nc.severity;
```

---

### Utilisation 3 — GEMBA WALK sur le code de l'appli

**Quand l'utiliser :** Avant de modifier une partie du code existant, ou quand quelque chose ne fonctionne pas comme prévu.

**Commandes types à lancer dans Claude Code :**
```
/analyse authentication implementation
/analyse planning calculation logic
/analyse task status transition flow
```

**Cas d'usage concrets pour le projet :**

```
/analyse calcul automatique des tâches de production
→ Vérifie que les formules (section 2 de la spec) sont bien implémentées
→ Détecte les écarts entre la logique attendue et le code réel
→ Identifie les cas non couverts (ex: Fixe ALU sans poste vitrage)

/analyse gestion des statuts de commande
→ Cartographie les transitions réelles dans le code
→ Vérifie que ATTENTE_VITRAGE se déclenche au bon moment
→ Détecte les transitions manquantes ou incorrectes

/analyse synchronisation SIAL-ISULA dans le planning
→ Vérifie la logique de calcul des dates (tampons chemin critique)
→ Identifie les cas où les grands formats ne bloquent pas le bon poste
```

---

### Workflow recommandé — Kaizen continu dans le projet

```
Chaque semaine (une fois l'appli en prod) :

1. MUDA rapide sur les données de la semaine
   /analyse données production semaine pour gaspillages
   → 10 min → liste des 3 points à améliorer

2. Si un poste pose problème :
   GEMBA WALK sur le code du composant concerné
   /analyse [composant] implementation
   → Vérifie que le code correspond à la réalité terrain

3. Si une vue est à refondre :
   VALUE STREAM MAPPING du flux concerné
   /analyse [flux] workflow
   → Redesign basé sur les données réelles
```

---

### Note importante pour Claude Code

Quand le skill `/analyse` est invoqué dans le contexte de ce projet, toujours alimenter l'analyse avec :
1. Les données réelles de la base PostgreSQL (requêtes SQL section ci-dessus)
2. Les capacités officielles des postes (section 3 de la spec)
3. Les tampons du chemin critique (section 7 de la spec)
4. Le nombre de NC et leur sévérité par poste et par type de châssis

L'objectif final est de construire une boucle d'amélioration continue : **données terrain → analyse Kaizen → amélioration de l'appli → nouvelles données → nouvel cycle.**
