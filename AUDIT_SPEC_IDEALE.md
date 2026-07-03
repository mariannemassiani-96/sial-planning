# Audit `sial-planning` — écarts vs spécification idéale

> Objet : confronter l'application telle qu'elle existe aujourd'hui à la
> spécification cible (SIAL 7 étapes, ISULA 6 étapes, synchro ISULA→SIAL,
> données PRO F2 / Odoo, ordonnancement backward DAG, détection des retards,
> affectation opérateur, priorisation).
>
> Référentiel pris pour le code : commit `a089207` sur `main` (algo « Proposition
> auto » V2 + rapport visuel).

---

## 1. Vue d'ensemble — ce qui existe / ce qui manque

L'application est mûre côté **front opérateur** (Aujourd'hui, timeline, RH,
SQDCP, Andon, OEE) et **calcul de charge théorique** (routage par type, temps
unitaires, multiplicateurs grand format). Elle est encore très en-deçà côté
**ingénierie de l'ordonnancement** :

- **la saisie commande sous-capte** : `SaisieCommande.tsx` ne demande pas
  `hauteur_mm`, `coloris_lot`, `laquage_externe + délai`, `ferrage_special`,
  `pose_chantier_date`, `regroupement_camion`, `operateur_prefere` — autant
  d'attributs nécessaires à l'algo. Tant qu'on n'importe pas PRO F2 (décision
  produit : on diffère), il faut que la saisie manuelle les capte tous.
- **deux modèles de données coexistent** sans pont opérationnel : un legacy
  `Commande` (JSON `lignes` / `vitrages`) qui sert à 100 % de l'IHM, et un
  schéma industriel `Order` / `FabItem` / `ProductionTask` / `QCCheck` /
  `BufferStock` / `NonConformity` qui n'est **que lu** (stats) — aucun write
  applicatif n'y va.
- **l'ordonnancement n'est pas vraiment backward** : on calcule des « semaines »
  (`semaine_coupe`/`semaine_montage`/…) en remontant de la livraison via des
  offsets de 1 semaine fixes ; la fonction `autoAssign` qui place les étapes
  dans la grille travaille en **forward** dans la semaine affichée, sur 5 jours
  glissants, sans DAG ni jalon « date au plus tard ».
- **pas de notion de cascade ISULA→SIAL en flux tiré** : la dépendance « V1/V2
  doit attendre les UV ISULA » est implicite via le tampon de 4 h entre
  phases (`postTamponAfter`) — il n'y a pas de stock tampon
  `BufferType.VITRAGES_ISULA` consommé/produit en BDD, ni de jalon de
  disponibilité par UV.
- **Odoo** est branché en RPC mais la sync sert à pousser des données, pas à
  tirer des OF.

---

## 2. Tableau de conformité

Légende : ✅ OK · ⚠️ Partiel · ❌ Absent.

### 2.1 — Sources de données (intrants)

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Import PRO F2 (XML/CSV) → ordres de fab | ⏸️ | Différé sur décision produit. Un parser texte sommaire `parseProF2()` existe dans `SaisieCommande.tsx:98` pour aider la saisie collée, mais l'import structuré n'est plus prioritaire. |
| Saisie commande exhaustive | ⚠️ | Voir §4.1 — il manque hauteur_mm, coloris_lot, laquage_externe, pose_chantier_date, regroupement_camion, operateur_prefere/interdit. |
| Synchro Odoo (clients, devis, projets) | ⚠️ | `src/lib/odoo.ts` + `odoo-sync.ts` connectent en JSON-RPC (`VISTA-PRODUCTION`) mais en sortie / lecture ad hoc. Pas de poll d'OF entrants. |
| Référentiels temps unitaires (gammes opératoires) | ⚠️ | Codé en dur dans `T = {…}` de `src/lib/sial-data.ts:53` (28 constantes). Pas éditable en BDD. La table `Tache(temps_unitaire)` existe mais n'est pas utilisée par `calcTempsType`. |
| Calendrier atelier (jours fériés, vendredi off, ISULA lun/mar/jeu) | ✅ | `JOURS_FERIES` (sial-data:329), `vendrediOff` (Operator), contrainte ISULA dans `autoAssign` (j ∈ {0,1,3}) à PlanningAffectations:867. |
| Compétences opérateur × poste avec niveaux | ✅ | `OperatorSkill(level: 0-3)` + `chooseNbOps` qui exige un superviseur si seul un apprenti est dispo (work-posts:243). |
| Capacité par poste (min/jour, parallélisme, monolithique) | ✅ | `WorkPost` Prisma + `WORK_POSTS` (work-posts:81). 35 postes, courbe `parallelGain`, flag `monolithic`. |
| Disponibilité opérateur (absences, RH, horaires détaillés) | ✅ | `OperatorAbsence`, `defaultSchedule` JSON, `useOperators()` consolide. |
| Stocks tampons inter-postes | ⚠️ | Table `BufferStock` + enum `BufferType` modélisés, mais aucune route `/api/buffer-stocks` et aucune écriture. Tableau lu uniquement par `StatsAdmin`. |

### 2.2 — Modèle de gamme

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| **SIAL 7 étapes** (débit · usinage · prépa ferrures · assemblage · pose vitrage · CQ · emballage) | ⚠️ | 5 phases mappées (`coupe / montage / vitrage / logistique / autre`). « Usinage / fraisage » n'existe pas en tant que poste séparé (le double-tête C4 et le poinçon ALU C6 le couvrent partiellement). « Préparation ferrures » est mélangée à F2 (`Ouv.+ferrage`). « Contrôle qualité » est implicite (poste F3 « Mise bois+CQ »). |
| **ISULA 6 étapes** (coupe · lavage · espaceur · primaire/butyle · secondaire · CQ+stockage) | ⚠️ | I1 Réception, I2 Coupe verre, I3 Coupe intercalaire, I4 Assemblage, I5 Butyle, I6 Gaz+scell., I7 Ctrl CEKAL, I8 Sortie+rangement. 8 postes — dont 5 invisibles par défaut (`visible:false` sur I5/I6/I7/I8). « Lavage » et « Primaire » ne sont pas explicites. |
| Routage par type de menuiserie | ✅ | `getRoute()` + `getRoutage()` dans `routage-production.ts`, 5 familles (frappe / fixe / coulissant / hors-standard / intervention). |
| Génération automatique des étapes ISULA quand vitrage `fournisseur=isula` | ✅ | `isulaInfoFromCmd()` puis branche I1-I4 dans `getRoutage` (routage-production:306). |
| Dépendances entre étapes (DAG) | ⚠️ | `RouteStep.dependsOn` existe mais en string (poste précédent), pas un vrai DAG. Aucun champ `predecessorIds[]` sur `ProductionTask`. |
| Multiplicateur grand format (>4m) sur montage + vitrage | ✅ | `specialMultiplier()` + `detectSpecialMultiplier()` (sial-data:210). |

### 2.3 — Calcul de charge

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Charge théorique chantier × poste (minutes) | ✅ | `calcTempsType()` → `par_poste.{coupe,coulissant,frappes,vitrage_ov}`. |
| Charge hebdo par poste (heatmap) | ✅ | `ChargeCapacite.tsx` 8 semaines + `detectBottleneck()`. |
| Apprentissage des temps réels (cerveau) | ✅ | `getAllLearnedTimes()` → `LearnedTimesMap` injecté dans `getRoutage(learned)`. |
| Capacité opérateur hebdo nette (h - absences - férié - vendredi off) | ✅ | Bloc `OpCapa` dans `autoAssign` (PlanningAffectations:763). |

### 2.4 — Ordonnancement

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| **Planification backward depuis la livraison** | ⚠️ | `computeAutoSemaines()` calcule `semaine_logistique = livraison`, puis -1 sem pour vitrage, -1 pour montage, -1 pour coupe (auto-planning:108). C'est du backward **gros grain** (semaine entière) sans tampon variable ni capacité. Le placement fin (étape × créneau ½j) est **forward** : on remplit du lundi au vendredi. |
| **Backward avec respect de la capacité** | ❌ | Aucune fonction qui dit « pour livrer le 27/05, il me faut 6 j-personne C3 + 3 j-personne F2 → reculer jusqu'à trouver 6 j-personne libres avant le 26/05 ». L'algo place greedy à partir de today. |
| DAG de précédences (coupe→montage→vitrage→…) | ⚠️ | Implicite via `phaseOrderMap = {coupe:0, montage:1, vitrage:2, logistique:3, isula:4}` + `lastSlotIdxByPhase`. Pas de graphe explicite, donc pas de chemin critique cross-postes. |
| Tampon entre phases (4 h par défaut) | ✅ | `postTamponAfter()` lu sur le poste, converti en demi-journées (PlanningAffectations:850). |
| Synchronisation ISULA → pose vitrage SIAL | ⚠️ | Indirecte : `semaine_isula = semaine_montage - 1 sem` (auto-planning:117) et tampon 4 h. Aucun pont direct « UV n°X disponible le J → V1 chantier Y peut démarrer J+½j ». |
| Prise en compte des jalons matières (date_alu, date_pvc, date_accessoires) | ⚠️ | `dateDemarrage(cmd)` prend le max des dates matières (sial-data:420), `calcCheminCritique` utilise comme borne basse. **N'est pas réutilisé par `autoAssign`**. |
| Stratégie crash / focus / normal selon CR | ✅ | `detectStrategy(joursDispo, joursBesoin)` → `chooseNbOps` (work-posts:302). Appliquée chantier-par-chantier dans `autoAssign`. |
| Critical Ratio par chantier | ✅ | `calcCriticalRatio()` (scheduling-priority:35). Affiché dans `Aujourdhui.tsx`. |
| Détection goulot DBR | ✅ | `detectBottleneck()` (scheduling-priority:117) sur la semaine en cours. |
| Lissage Heijunka mode-jour | ⚠️ | `suggestModeJourSemaine()` propose un mix Frappes/Coulissants par jour mais ne recale pas les tâches. C'est un conseil, pas une contrainte. |

### 2.5 — Affectation opérateur

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Match compétence × poste | ✅ | Filtre `competentOps` puis fallback phase. |
| Niveaux (apprenti / autonome / expert) + supervision | ✅ | `chooseNbOps()` ajoute un superviseur si tous les producers sont apprentis. |
| Score multi-critères (skill, brain, habit, sous-utilisation) | ✅ | Score = 0.35×skill + 0.25×brain + 0.2×habit − 0.2×useRatio (PlanningAffectations:898). |
| Capacité hebdo respectée par opérateur | ✅ | Décrément `opCapa.remaining` à chaque placement (PlanningAffectations:931). |
| Plafond `maxOperators` du poste | ✅ | `postMaxPers(et.postId)` avant placement. |
| Rapport « pourquoi tel chantier non placé » | ✅ | `AutoAssignReport` modal avec `fullyPlaced / partiallyPlaced / notPlaced` + `opUsage` (PlanningAffectations:984). |

### 2.6 — Détection retards & alertes

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Retard prévisionnel par chantier | ✅ | `calcCheminCritique(cmd).retardJours` (sial-data:526). |
| Critical Ratio < 1 (impossible) | ✅ | `calcCriticalRatio()` retourne `level: "impossible"`. |
| Retards en cours (étape pas démarrée à la date prévue) | ⚠️ | `etape_*_ok` boolean + `etape_*_date` permettent de checker manuellement, mais aucune route ne calcule « X étapes en retard aujourd'hui ». |
| Alertes Andon en temps réel | ✅ | `AndonPanel.tsx` (panne / manque matériel / défaut / autre). Stocké en mémo. |
| SQDCP daily | ✅ | `SqdcpPanel.tsx` saisie quotidienne 5 indicateurs. |

### 2.7 — Priorisation

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Tri priorité chantier (chantier_bloqué / urgente / normale) | ✅ | `prioMap` dans `autoAssign` + tri Earliest Due Date secondaire. |
| LPT (longest processing time first) après deadline | ✅ | `etapes.sort` finit sur `b.minutes - a.minutes` (PlanningAffectations:794). |
| Priorité « contrainte client » (chantier installé) | ⚠️ | Statut `chantier_bloque` existe mais n'a pas de canal d'entrée — saisie manuelle. |

---

## 3. Liste priorisée des chantiers à mener

Ordre = impact métier (qualité du planning vs effort).

> **Décision produit (mai 2026)** : on ne cherche PAS à brancher l'import
> PRO F2 pour l'instant. La règle posée par Marianne est :
> *« si on ne peut pas importer, on saisit manuellement TOUTES les
> informations raisonnées dont l'algorithme a besoin »*. Le P0 d'origine
> n°1 (import PRO F2) est donc requalifié P2 et remplacé par
> « SaisieCommande exhaustive ».

### P0 — Bloquants (à faire avant le reste)

1. **Saisie commande exhaustive** : étendre `SaisieCommande.tsx` pour
   capter tous les attributs manquants (dimensions par ligne,
   précédences, jalons par étape, contraintes de regroupement camion,
   préférence opérateur, contrainte coloris/laquage). Voir §4.1.
2. **Unifier le modèle données : `Commande` (legacy) → `Order` + `FabItem`**.
   Aujourd'hui les composants lisent `commandes` (JSON), les stats lisent
   `ProductionTask`. Soit on déprécie un côté, soit on écrit un adaptateur
   qui projette `Commande` vers `Order/FabItem` à chaque création (job
   transactionnel). Recommandation : **migrer les écritures côté
   `Order/FabItem`** et garder `Commande` en vue dénormalisée.
3. **Ordonnancement backward avec capacité** : remplacer
   `computeAutoSemaines()` (offsets fixes 1 sem) par un algo qui recule
   chaque étape jusqu'à trouver capacité × compétence dispos. Voir §4.2.

### P1 — Très utiles (après P0)

4. **DAG de précédences** sur `ProductionTask` (champ
   `predecessorIds: String[]`) + utilisation par l'algo. Permet de coder
   « V1 chantier X → dépend de I7 du même fabItem » sans passer par les
   demi-journées.
5. **Buffer ISULA→SIAL en BDD** : produire des `BufferStock` quand I7
   termine une UV, consommer quand V1/V2 démarre. Source de vérité pour la
   synchro flux tiré.
6. **Externaliser temps unitaires en BDD** : la table `Tache(temps_unitaire,
   unite, parallelisable)` existe déjà ; faire que `calcTempsType` lise
   d'abord la BDD et fallback sur `T = {…}` en `sial-data.ts:53`. Permet à
   AJ de calibrer sans déploiement.
7. **Reporting des retards en cours** : route `/api/retards` qui compare
   `etape_X_date` vs `today` et renvoie la liste des chantiers en alerte.

### P2 — Nice-to-have

8. **Vrai split des 7 étapes SIAL** : ajouter postes `U1` (usinage),
   `P1`/`P2` (préparation ferrures séparée du ferrage), `CQ1` (contrôle
   final dédié), `EM1` (emballage). Renommer la phase `vitrage` en
   `pose_vitrage` pour cohérence.
9. **Lissage Heijunka effectif** : permettre à `autoAssign` de répartir le
   travail des frappes entre lundi et mercredi au lieu de tout caser le
   lundi.
10. **Import PRO F2** (requalifié P2 sur décision produit) : tant que la
    saisie manuelle reste tractable, on diffère.
11. **Polling Odoo** des OF entrants (cron horaire) → push dans `Order`.
12. **Fenêtres mobiles d'opérateur** : afficher les minutes restantes par
    op dans le rapport visuel pour qu'AJ voie immédiatement « Bruno : 4 h
    libres mardi PM ».

---

## 4. Implémentations concrètes pour les 3 écarts critiques

### 4.1 Saisie commande exhaustive (en remplacement de l'import PRO F2)

Décision : on ne câble PAS PRO F2 maintenant. À la place, on rend
`SaisieCommande.tsx` capable de capter **tout** ce dont l'algo a besoin,
même si c'est plus long à saisir. C'est mieux que des planifs fausses
faute de données.

#### a) État actuel de la saisie

`SaisieCommande.tsx` (`empty` + `emptyLigne` + `emptyVitrage` à
src/components/tabs/SaisieCommande.tsx:9-47) capte aujourd'hui :

- Identification : client, ref_chantier, num_commande
- Planning livraison : zone, type_commande, atelier, priorité, montant_ht,
  semaine_théorique, semaine_atteignable, transporteur
- Multi-livraisons : `nb_livraisons` + `dates_livraisons[]`
- Matières amont : date_alu, date_pvc, date_accessoires, date_panneau_porte,
  date_volet_roulant + flags nécessaire/passée
- Lignes : type, quantité, coloris, largeur_mm, hs_temps (si HS)
- Vitrages : composition, qté, surface_m2, fournisseur, date_reception,
  position, faces, intercalaire, largeur, hauteur, forme, prix
- Acompte + reliquats

#### b) Champs MANQUANTS pour que l'algo soit autonome

| Champ manquant | Niveau | Pourquoi l'algo en a besoin |
|---|---|---|
| `hauteur_mm` (par ligne) | ligne | Détecter grand format vertical (>3 m galandage) — actuellement seul `largeur_mm` est saisi (`emptyLigne` ligne 9). |
| `coloris_lot` (par ligne) | ligne | Regrouper les pièces du même coloris pour éviter le changement de série au laquage / poinçon. |
| `laquage_externe` + `delai_laquage_jours` | ligne | Le laquage extérieur (sous-traité) ajoute 5-10 j ouvrés ; sans cette info, l'algo croit que la coupe est dispo de suite. |
| `ferrage_special` (texte libre + `temps_supp_min`) | ligne | Mécanismes spécifiques (motorisation, oscillo-battant lourd) qui ne sont pas dans `T = {…}`. |
| `pose_chantier_date` (≠ livraison) | commande | Date de pose ferme (RDV poseur). C'est elle qui doit piloter le backward, pas la livraison camion. |
| `regroupement_camion` (`true`/`false`) | commande | Si vrai, l'algo ne doit pas split la production sur 2 semaines (sinon le 1er lot reste en stock). |
| `chantier_split_autorise` (`true`/`false`) | commande | Inverse : si vrai (ex. grand chantier 50 menuiseries), l'algo PEUT livrer en plusieurs vagues. |
| `operateur_prefere` (par ligne) | ligne | Marianne/AJ savent que tel coulissant grand format = Alain obligatoire (qualité critique). Aujourd'hui, seul HS le permet. |
| `operateur_interdit` (par ligne) | ligne | Inverse pour limiter les retours qualité (apprenti sur un chantier sensible). |
| `tampon_apres_min` (par ligne, optionnel) | ligne | Séchage colle / réglage spécifique > 4 h standard. |
| `vitrage_id_ext` (par vitrage) | vitrage | Identifiant ISULA ou fournisseur externe pour matcher le bon de commande. |
| `vitrage_dependances` (par vitrage : id ligne menuiserie qui le reçoit) | vitrage | Aujourd'hui le lien vitrage→menuiserie est implicite (par chantier entier). Empêche le calcul fin « V1 ouvrant n°3 attend UV n°7 ». |
| `controle_qualite_specifique` (texte libre) | commande/ligne | « test étanchéité au jet d'eau », « contrôle CEKAL renforcé »… ajoutent une étape CQ. |
| `notes_pose` | commande | Contraintes site (étage, ascenseur, accès limité) — utilisées par le chef d'équipe, pas l'algo, mais à conserver. |
| `risque_perso` (`bas`/`moyen`/`haut`) | commande | Pour pondérer le critique-ratio : un chantier Marianne/connu peut être plus tendu qu'un nouveau client. |

#### c) Schéma Prisma — additions

```prisma
model Commande {
  // ... existant ...
  pose_chantier_date     String?     // YYYY-MM-DD, RDV poseur ferme
  regroupement_camion    Boolean    @default(true)
  chantier_split_autorise Boolean    @default(false)
  controle_qualite_specifique String?
  notes_pose             String?
  risque_perso           String     @default("bas")  // bas | moyen | haut
}

// Le champ `lignes` (Json) reçoit ces nouveaux attributs par ligne :
//   {
//     type, quantite, coloris,
//     largeur_mm, hauteur_mm,                       // ← NOUVEAU hauteur_mm
//     coloris_lot,                                  // ← NOUVEAU
//     laquage_externe, delai_laquage_jours,         // ← NOUVEAU
//     ferrage_special, temps_supp_min,              // ← NOUVEAU
//     operateur_prefere, operateur_interdit,        // ← NOUVEAU
//     tampon_apres_min,                             // ← NOUVEAU
//     hs_temps: { ... }
//   }
//
// Le champ `vitrages` (Json) reçoit :
//   { ..., vitrage_id_ext, ligne_menuiserie_id (string) }   // ← NOUVEAU
```

Comme `Commande.lignes` et `Commande.vitrages` sont déjà des `Json`, on
peut **étendre sans migration cassante**. On ajoute uniquement
`pose_chantier_date`, `regroupement_camion`, `chantier_split_autorise`,
`controle_qualite_specifique`, `notes_pose`, `risque_perso` (5 champs
scalaires, migration `ALTER TABLE` simple).

#### d) Pseudo-code — extension du formulaire (`SaisieCommande.tsx`)

```tsx
const emptyLigne = {
  type: "ob1_pvc",
  quantite: 1,
  coloris: "blanc",
  // ── NOUVEAUX champs ────────────────────────────────────────────
  largeur_mm: "",
  hauteur_mm: "",                         // ← capter L×H systématiquement
  coloris_lot: "",                        // ← libellé lot peinture
  laquage_externe: false,
  delai_laquage_jours: "",                // ex 7
  ferrage_special: "",                    // texte libre
  temps_supp_min: "",                     // minutes ajoutées au montage
  operateur_prefere: "",                  // id op (cf. EQUIPE)
  operateur_interdit: "",                 // id op
  tampon_apres_min: "",                   // optionnel, défaut 240
  // ── Existants HS ───────────────────────────────────────────────
  hs_nb_profils: "", hs_t_coupe: "", hs_t_montage: "", hs_t_vitrage: "",
  hs_op_montage: "jp", hs_op_vitrage: "quentin", hs_notes: "",
};

const emptyVitrage = {
  // ... existant ...
  vitrage_id_ext: "",                     // ← n° BC ISULA ou fournisseur
  ligne_menuiserie_id: "",                // ← lien ligne menuiserie destinataire
};

const empty = {
  // ... existant ...
  pose_chantier_date: "",                 // RDV poseur ferme
  regroupement_camion: true,
  chantier_split_autorise: false,
  controle_qualite_specifique: "",
  notes_pose: "",
  risque_perso: "bas",
  lignes: [{ ...emptyLigne }],
  vitrages: [{ ...emptyVitrage }],
};
```

#### e) UI — où mettre ces champs

```tsx
// 1. Sous "PLANNING LIVRAISON" — encart "POSE & TRANSPORT"
<div style={cardStyle}>
  <div style={{ ...titleStyle, color: C.cyan }}>POSE & TRANSPORT</div>
  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
    <Field label="DATE POSE CHANTIER (RDV poseur)" type="date"
      value={f.pose_chantier_date}
      onChange={v => set("pose_chantier_date", v)}
      hint="Si vide, on utilise date_livraison_souhaitée" />
    <Switch label="REGROUPEMENT CAMION (pas de split sem.)"
      value={f.regroupement_camion}
      onChange={v => set("regroupement_camion", v)} />
    <Switch label="SPLIT CHANTIER AUTORISÉ (gros chantier)"
      value={f.chantier_split_autorise}
      onChange={v => set("chantier_split_autorise", v)} />
  </div>
</div>

// 2. Dans le bloc "MENUISERIES" — chaque ligne expose 2 onglets :
//    [Standard] (type/qté/coloris) — visible par défaut
//    [Avancé]   (L×H, lot, laquage, ferrage, op préféré, tampon)
//                — replié, à déplier
<div className="ligne-tabs">
  <button onClick={() => setExpandedLigne(i, !expanded)}>
    {expanded ? "− Masquer avancé" : "+ Options avancées"}
  </button>
  {expanded && (
    <div style={advancedGrid}>
      <Field label="HAUTEUR (mm)" type="number" value={lg.hauteur_mm}
        onChange={v => setLigne(i, "hauteur_mm", v)} />
      <Field label="COLORIS LOT" value={lg.coloris_lot}
        onChange={v => setLigne(i, "coloris_lot", v)}
        hint="Pour regrouper la production des pièces de même coloris" />
      <Switch label="LAQUAGE EXTERNE (sous-traitance)"
        value={lg.laquage_externe}
        onChange={v => setLigne(i, "laquage_externe", v)} />
      {lg.laquage_externe && (
        <Field label="DÉLAI LAQUAGE (j ouvrés)" type="number"
          value={lg.delai_laquage_jours}
          onChange={v => setLigne(i, "delai_laquage_jours", v)} />
      )}
      <Field label="FERRAGE SPÉCIAL" value={lg.ferrage_special}
        onChange={v => setLigne(i, "ferrage_special", v)}
        placeholder="ex: motorisation Somfy + oscillo lourd" />
      <Field label="TEMPS SUPPL. MONTAGE (min)" type="number"
        value={lg.temps_supp_min}
        onChange={v => setLigne(i, "temps_supp_min", v)} />
      <SelectOp label="OPÉRATEUR PRÉFÉRÉ" value={lg.operateur_prefere}
        onChange={v => setLigne(i, "operateur_prefere", v)} />
      <SelectOp label="OPÉRATEUR INTERDIT" value={lg.operateur_interdit}
        onChange={v => setLigne(i, "operateur_interdit", v)} />
      <Field label="TAMPON APRÈS (min, défaut 240)" type="number"
        value={lg.tampon_apres_min}
        onChange={v => setLigne(i, "tampon_apres_min", v)} />
    </div>
  )}
</div>

// 3. Dans le bloc "VITRAGES" — par vitrage, ajouter :
<Field label="N° BC FOURNISSEUR" value={v.vitrage_id_ext}
  onChange={x => setVitrage(i, "vitrage_id_ext", x)} />
<SelectLigne label="MENUISERIE DESTINATAIRE" lignes={f.lignes}
  value={v.ligne_menuiserie_id}
  onChange={x => setVitrage(i, "ligne_menuiserie_id", x)} />

// 4. Nouveau bloc "QUALITÉ & RISQUE" en bas
<div style={cardStyle}>
  <div style={{ ...titleStyle, color: C.purple }}>QUALITÉ & RISQUE</div>
  <Field label="CONTRÔLE QUALITÉ SPÉCIFIQUE"
    value={f.controle_qualite_specifique}
    onChange={v => set("controle_qualite_specifique", v)}
    placeholder="ex: test étanchéité au jet d'eau, CEKAL renforcé" />
  <Field label="NOTES POSE (accès, étage, contraintes site)"
    value={f.notes_pose}
    onChange={v => set("notes_pose", v)} />
  <Select label="RISQUE PERSO (chantier sensible ?)"
    options={[{v:"bas",l:"Standard"},{v:"moyen",l:"À surveiller"},{v:"haut",l:"Critique"}]}
    value={f.risque_perso}
    onChange={v => set("risque_perso", v)} />
</div>
```

#### f) Branchement algo

Une fois les champs saisis, l'algo `autoAssign` doit les exploiter :

```ts
// Dans tryPlaceEtape (PlanningAffectations.tsx:813)
function tryPlaceEtape(et: Etape, allowPhaseFallback: boolean) {
  // ... existant ...

  // ── NOUVEAU 1 : pose_chantier_date prime sur date_livraison ────────
  const cmd = commandes.find(c => c.id === et.cmdId);
  const deadlineEffective = cmd?.pose_chantier_date || cmd?.date_livraison_souhaitee || et.deadline;

  // ── NOUVEAU 2 : opérateur préféré boost score ────────────────────
  const ligne = (cmd?.lignes || []).find(l => /* match étape */);
  const opPref = ligne?.operateur_prefere;
  const opInterdit = ligne?.operateur_interdit;

  competentOps = competentOps
    .filter(op => !opInterdit || op.id !== opInterdit);

  // ── NOUVEAU 3 : tampon custom ─────────────────────────────────────
  const tamponCustom = ligne?.tampon_apres_min
    ? parseInt(ligne.tampon_apres_min)
    : postTamponAfter(et.postId);

  // ── NOUVEAU 4 : laquage externe = jalon earliestStart ──────────
  if (ligne?.laquage_externe && et.phase === "montage") {
    const finCoupe = progress[et.chantier]?.lastSlotIdxByPhase?.coupe || 0;
    const delaiLaq = parseInt(ligne.delai_laquage_jours || "5");
    earliestSlot = Math.max(earliestSlot, finCoupe + delaiLaq * 2); // ×2 = demis
  }

  // ── NOUVEAU 5 : grand format vertical (galandage > 3 m) ─────────
  if (ligne?.hauteur_mm > 3000 && et.phase === "montage") {
    nbPers = Math.max(nbPers, 2); // toujours au moins 2 pour port pièce
  }

  // ── NOUVEAU 6 : regroupement_camion ─────────────────────────────
  // Si true, on AJOUTE une contrainte que toutes les phases du chantier
  // finissent dans la même semaine (ne pas split sur 2 semaines).
  // Si chantier_split_autorise=true, on peut au contraire éclater.

  // ── NOUVEAU 7 : score booster pour op préféré ──────────────────
  for (const o of availOps) {
    if (opPref && o.op.id === opPref) o.score += 0.5;
  }
}
```

---

### 4.2 Ordonnancement backward avec capacité (DAG + créneaux)

#### Schéma Prisma — additions

```prisma
model ProductionTask {
  // ... existant ...
  predecessorIds  String[]      // IDs ProductionTask qui doivent finir avant
  earliestStart   DateTime?     // jalon matière (date_alu/pvc/...)
  latestFinish    DateTime?     // calculé par backward = livraison - tampons aval
  scheduledStart  DateTime?     // posé par l'algo
  scheduledEnd    DateTime?     // posé par l'algo
}

model ScheduleSlot {
  id          String         @id @default(cuid())
  taskId      String
  operatorId  String
  date        DateTime       // jour du créneau
  halfDay     HalfDay        // AM / PM
  minutes     Int            // minutes effectives sur ce créneau (≤240)
  task        ProductionTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  operator    Operator       @relation(fields: [operatorId], references: [id], onDelete: Cascade)

  @@index([date, halfDay])
  @@unique([taskId, operatorId, date, halfDay])
}

enum HalfDay { AM PM }
```

#### Pseudo-code (`src/lib/scheduling-backward.ts`)

```ts
// ── Ordonnancement backward depuis la deadline ───────────────────────────
// 1. Pour chaque order, calculer latestFinish de chaque task :
//      task.latestFinish = order.deliveryDate - tampon_aval(task)
//    où tampon_aval = somme des durées + tampons des successeurs sur le DAG
// 2. Trier les tasks par latestFinish ASC (les plus urgentes d'abord)
// 3. Pour chaque task, RECULER depuis latestFinish jusqu'à trouver le slot
//    le plus tardif où :
//      - capacity du poste pas saturée
//      - compétence opérateur dispo
//      - opérateur a des heures restantes
//      - earliestStart respecté (jalons matière)

interface ScheduleResult {
  scheduled: Array<{ taskId: string; slots: ScheduleSlotInput[] }>;
  unscheduled: Array<{ taskId: string; reason: string }>;
}

export async function backwardSchedule(orderId: string): Promise<ScheduleResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: { include: { tasks: true } } },
  });
  if (!order) throw new Error("order not found");

  // ── 1. Construire le DAG complet des tasks ─────────────────────────
  const tasks = order.items.flatMap(i => i.tasks);
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // ── 2. Calculer latestFinish par récursion descendante (DAG inversé) ─
  const latestFinish = new Map<string, Date>();
  function computeLatest(taskId: string): Date {
    if (latestFinish.has(taskId)) return latestFinish.get(taskId)!;
    const task = taskMap.get(taskId)!;
    const successors = tasks.filter(t => t.predecessorIds.includes(taskId));
    if (successors.length === 0) {
      // feuille → livraison - 0
      latestFinish.set(taskId, order.deliveryDate);
      return order.deliveryDate;
    }
    // doit finir avant le min des "latestStart" des successeurs
    const minStartSucc = Math.min(...successors.map(s => {
      const sFinish = computeLatest(s.id);
      const dur = s.estimatedMinutes;
      const tampon = WORK_POSTS_BY_ID[s.workPostId].tamponMinAfter;
      return subtractWorkMinutes(sFinish, dur + tampon).getTime();
    }));
    const lf = new Date(minStartSucc);
    latestFinish.set(taskId, lf);
    return lf;
  }
  tasks.forEach(t => computeLatest(t.id));

  // ── 3. Trier par urgence (latestFinish ASC) ────────────────────────
  const sorted = [...tasks].sort((a, b) =>
    latestFinish.get(a.id)!.getTime() - latestFinish.get(b.id)!.getTime()
  );

  // ── 4. Charger état actuel : slots déjà posés, capacité ops ────────
  const opCapa = await loadOperatorCapacity(order.deliveryDate); // hebdo nette
  const cellLoad = await loadCellLoad();                          // pid|date|halfDay → minutes

  const scheduled: ScheduleResult["scheduled"] = [];
  const unscheduled: ScheduleResult["unscheduled"] = [];

  // ── 5. Pour chaque task, REMONTER depuis latestFinish ──────────────
  for (const task of sorted) {
    const lf = latestFinish.get(task.id)!;
    const post = await prisma.workPost.findUnique({ where: { id: task.workPostId } });
    if (!post) { unscheduled.push({ taskId: task.id, reason: "post not found" }); continue; }

    // Compétences : opérateurs habilités sur ce poste
    const competentOps = await prisma.operator.findMany({
      where: { skills: { some: { workPostId: post.id, level: { gt: 0 } } } },
      include: { skills: { where: { workPostId: post.id } } },
    });
    if (competentOps.length === 0) {
      unscheduled.push({ taskId: task.id, reason: `aucun op compétent sur ${post.id}` });
      continue;
    }

    // Stratégie crash/normal selon marge
    const strategy = detectStrategy(workdaysBetween(new Date(), lf), task.estimatedMinutes / 480);
    const decision = chooseNbOps(post.id, strategy, competentOps.map(o => o.skills[0].level));
    const nbPers = Math.max(1, post.monolithic ? 1 : decision.nbProducers);
    const slotsNeeded = Math.ceil(task.estimatedMinutes / (240 * nbPers));

    // ── BACKWARD : essayer chaque demi-journée en partant de latestFinish ─
    const slots: ScheduleSlotInput[] = [];
    let cursor = halfDayBefore(lf);   // lf au format demi-journée (AM/PM)
    let placed = 0;
    let attempts = 0;
    const minStart = task.earliestStart || subtractWorkdays(order.deliveryDate, 60);

    while (placed < slotsNeeded && cursor >= minStart && attempts++ < 200) {
      // Respecter contrainte ISULA (lun/mar/jeu) si phase isula
      if (post.phase === "isula" && !isIsulaDay(cursor.date)) {
        cursor = halfDayBefore(cursor); continue;
      }
      // Capacité du poste sur ce créneau ?
      const cellKey = `${post.id}|${formatDate(cursor.date)}|${cursor.halfDay}`;
      if ((cellLoad.get(cellKey) || 0) >= post.capacityMinDay / 2) {
        cursor = halfDayBefore(cursor); continue;
      }
      // Opérateurs dispos sur ce créneau ?
      const availOps = competentOps
        .filter(op => opCapa.get(op.id)!.remaining >= 30)
        .filter(op => !isAbsent(op, cursor.date))
        .filter(op => !isAlreadyBookedElsewhere(op, cursor, post.id))
        .sort(scoreFn);  // skill/brain/habit/sous-utilisation
      if (availOps.length < nbPers) { cursor = halfDayBefore(cursor); continue; }

      // ── On pose le slot ─────────────────────────────────────────
      const opsTake = availOps.slice(0, nbPers);
      const minutesThisSlot = Math.min(240, task.estimatedMinutes - slots.reduce((s,x)=>s+x.minutes,0));
      for (const op of opsTake) {
        slots.push({
          taskId: task.id, operatorId: op.id,
          date: cursor.date, halfDay: cursor.halfDay,
          minutes: minutesThisSlot,
        });
        opCapa.get(op.id)!.remaining -= minutesThisSlot;
      }
      cellLoad.set(cellKey, (cellLoad.get(cellKey) || 0) + minutesThisSlot);
      placed++;
      cursor = halfDayBefore(cursor);
    }

    if (placed === slotsNeeded) {
      scheduled.push({ taskId: task.id, slots });
      // Mettre à jour scheduledStart/End sur la task
      const sortedSlots = [...slots].sort((a,b) => a.date.getTime() - b.date.getTime());
      await prisma.productionTask.update({
        where: { id: task.id },
        data: {
          scheduledStart: sortedSlots[0].date,
          scheduledEnd:   sortedSlots[sortedSlots.length-1].date,
          status: "PENDING",
        },
      });
      await prisma.scheduleSlot.createMany({ data: slots });
    } else {
      unscheduled.push({
        taskId: task.id,
        reason: cursor < minStart
          ? `impossible : pas assez de capacité avant ${formatDate(lf)}`
          : `partiel ${placed}/${slotsNeeded}`,
      });
    }
  }

  return { scheduled, unscheduled };
}
```

Notes d'implémentation :

- `subtractWorkMinutes` / `halfDayBefore` doivent **sauter le weekend, les
  jours fériés, le vendredi PM si `op.vendrediOff`**.
- En version 1, on peut traiter **chaque order indépendamment** (loop
  externe trie les orders par deliveryDate ASC). En V2, traiter en bloc
  pour optimiser globalement.
- Le rapport `unscheduled` réutilise la même structure que `AutoAssignReport`
  actuelle → on peut afficher le même modal.

---

### 4.3 Synchro ISULA → SIAL via `BufferStock` consommé

#### Schéma Prisma — additions

```prisma
model BufferStock {
  // ... existant ...
  taskProducerId String?         // ProductionTask qui a produit ce stock
  taskConsumerId String?         // ProductionTask qui le consomme
  fabItemSourceId String?         // pour tracer "ce stock vient de l'UV X"
  readyAt        DateTime?       // quand l'item est dispo (fin de I7)
  consumedAt     DateTime?       // quand V1/V2 le prend
}
```

#### Pseudo-code — production / consommation

```ts
// ── Quand on termine I7 (Contrôle final CEKAL) sur un fabItem ─────────
export async function onIsulaTaskComplete(task: ProductionTask) {
  if (task.workPostId !== "I7") return;
  const fabItem = await prisma.fabItem.findUnique({ where: { id: task.fabItemId } });
  if (!fabItem) return;

  // Produire un BufferStock VITRAGES_ISULA prêt à consommer
  await prisma.bufferStock.create({
    data: {
      orderId:        fabItem.orderId,
      type:           "VITRAGES_ISULA",
      quantity:       fabItem.quantity,
      unit:           "uv",
      taskProducerId: task.id,
      fabItemSourceId: fabItem.id,
      readyAt:        new Date(),
    },
  });

  // Débloquer la tâche V1/V2 du même fabItem si elle était en BLOCKED
  await prisma.productionTask.updateMany({
    where: {
      fabItemId: fabItem.id,
      workPostId: { in: ["V1", "V2"] },
      status: "BLOCKED",
      blockedReason: { contains: "ISULA" },
    },
    data: { status: "PENDING", blockedReason: null },
  });

  // Notifier (Andon ?) que le fabItem est prêt pour la pose vitrage
  await prisma.memoAction.create({
    data: {
      auteur: "système",
      texte:  `UV ${fabItem.label} prêt — pose vitrage SIAL débloquée`,
      type:   "planning",
      priorite: "normale",
    },
  });
}

// ── Quand V1/V2 démarre sur un fabItem ────────────────────────────────
export async function onPoseVitrageStart(task: ProductionTask) {
  if (task.workPostId !== "V1" && task.workPostId !== "V2") return;
  const buffer = await prisma.bufferStock.findFirst({
    where: {
      fabItemSourceId: task.fabItemId,
      type: "VITRAGES_ISULA",
      consumedAt: null,
    },
  });
  if (!buffer) {
    // pas d'UV dispo → bloquer la tâche
    await prisma.productionTask.update({
      where: { id: task.id },
      data: {
        status: "BLOCKED",
        blockedReason: "Vitrage ISULA pas encore prêt (I7 non terminé)",
      },
    });
    return;
  }
  // Consommer le buffer
  await prisma.bufferStock.update({
    where: { id: buffer.id },
    data: { consumedAt: new Date(), taskConsumerId: task.id },
  });
}

// ── Au lancement d'un order, propager les blocages ─────────────────────
export async function initIsulaSialDependencies(orderId: string) {
  const tasks = await prisma.productionTask.findMany({
    where: { fabItem: { orderId } },
    include: { fabItem: true },
  });
  for (const t of tasks) {
    if (t.workPostId === "V1" || t.workPostId === "V2") {
      // Trouver les tasks ISULA du même fabItem
      const isulaTasks = tasks.filter(x =>
        x.fabItemId === t.fabItemId && x.workPostId.startsWith("I")
      );
      if (isulaTasks.length > 0) {
        // Ajouter I7 (ou dernière étape ISULA) en prédécesseur
        const lastIsula = isulaTasks.find(x => x.workPostId === "I7")
                       || isulaTasks.sort((a,b) => b.sortOrder - a.sortOrder)[0];
        await prisma.productionTask.update({
          where: { id: t.id },
          data: {
            predecessorIds: { push: lastIsula.id },
            isBlocking: true,
          },
        });
      }
    }
  }
}
```

Cet ensemble :

1. **Le DAG sait** que V1/V2 dépend de I7 du même fabItem
   (`predecessorIds`) → l'ordonnancement backward de §4.2 le respecte.
2. **Le buffer matérialise** la disponibilité réelle : à l'exécution, V1
   ne démarre que si un `BufferStock VITRAGES_ISULA` est prêt.
3. **L'Andon est piloté automatiquement** : si V1 prévu jeudi mais I7 pas
   fini, on bloque la task et on crée un mémo.

---

## 5. Synthèse / next step

| Priorité | Chantier | Effort | Impact |
|:---:|---|:---:|:---:|
| P0 | **SaisieCommande exhaustive** (champs manquants) | M | 🔥🔥🔥 |
| P0 | Backward scheduling avec capacité | L | 🔥🔥🔥 |
| P0 | Unifier `Commande` ↔ `Order` | L | 🔥🔥🔥 |
| P1 | DAG `predecessorIds` sur `ProductionTask` | S | 🔥🔥 |
| P1 | Buffer ISULA→SIAL en BDD | M | 🔥🔥 |
| P1 | Externaliser temps unitaires | S | 🔥🔥 |
| P1 | Reporting retards en cours | S | 🔥 |
| P2 | Split 7 étapes SIAL strict | M | 🔥 |
| P2 | Heijunka effectif | M | 🔥 |
| P2 | **Import PRO F2** (différé sur décision produit) | M | 🔥 |
| P2 | Polling Odoo OF | S | 🔥 |
| P2 | Fenêtres mobiles op dans rapport | XS | 🔥 |

XS = 2 h · S = ½ jour · M = 2-3 jours · L = 1 semaine.

**Recommandation immédiate** : commencer par 4.1 (SaisieCommande
exhaustive). C'est ce qui débloque tout le reste : tant qu'on n'a pas
`hauteur_mm`, `laquage_externe`, `pose_chantier_date`, `regroupement_camion`,
`operateur_prefere`, le backward scheduling marchera mais produira des
plans naïfs (ignorera les laquages, respectera la mauvaise deadline,
autorisera des split que le client n'accepte pas).
