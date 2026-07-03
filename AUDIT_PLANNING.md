# Audit du moteur de planification — sial-planning

> Lecture seule. Code analysé sur la branche `claude/audit-scheduling-system-mlwtq`,
> HEAD `5a09dec`.
> Le projet possède **deux moteurs distincts** :
>   - **autoAssign** : héritage UI semaine, placement forward dans la grille demi-journées.
>   - **backwardSchedule** : ajouté en Phase 0-B (commit `f5283ae`), placement reverse depuis la deadline.
> Les deux sont disponibles côte à côte dans `PlanningAffectations.tsx` (boutons « Proposition auto (semaines) » et « Planifier backward (créneaux) »).

---

## 1. Moteur de calcul

### Fichiers et fonctions

| Moteur | Fichier | Fonction principale | Lignes clés |
|---|---|---|---|
| Moteur 1 (forward, IHM semaine) | `src/components/tabs/PlanningAffectations.tsx` | `autoAssign` (useCallback) | définition L.727, boucle de placement L.843-955 (`tryPlaceEtape`) |
| Moteur 2 (backward, créneau ½j) | `src/lib/scheduling-backward.ts` | `backwardSchedule(orderId)` | définition L.74, `computeLatest` L.106-128, boucle reverse L.167-275 |
| Calcul de semaines macro (offsets fixes) | `src/lib/auto-planning.ts` | `computeAutoSemaines(cmd)` | L.89-152 — pose `semaine_coupe`/`montage`/`vitrage`/`logistique`/`isula` |
| Détection goulot | `src/lib/scheduling-priority.ts` | `detectBottleneck`, `calcCriticalRatio`, `calcTakt` | L.35, L.117, L.166 |
| Lissage Heijunka (post-traitement, non bloquant) | `src/lib/auto-planning.ts` | `heijunkaRebalance` | L.196-256, appelé par `scheduling-backward.ts:288-313` |
| Routage métier (tâches générées par type) | `src/lib/routage-production.ts` | `getRoutage(typeId, qte, …)` | L.202-360 |

### Classification de l'algorithme

**(a) Glouton / premier créneau libre, avec règles de priorité.**

Aucun solveur OR-Tools, MILP, CP-SAT, ni bibliothèque tierce d'optimisation
combinatoire. Le `package.json` ne contient pas de dépendance liée à ce type
de calcul (vérifié par `grep` sur `ortools`, `glpk`, `solver` — ABSENT).

Plus précisément :

- `autoAssign` : tri global des étapes par (priorité chantier → deadline → ordre de phase → durée descendante / LPT) — `PlanningAffectations.tsx:819-826`. Puis pour chaque étape, premier créneau libre dans la semaine affichée (boucle `globalIdx < 10` L.861).
- `backwardSchedule` : tri par `latestFinish` ASC (`scheduling-backward.ts:131-134`) puis pour chaque tâche, premier créneau libre EN REMONTANT depuis `latestFinish` (boucle `while (placed < slotsNeeded && attempts++ < MAX_ATTEMPTS)` L.204, MAX_ATTEMPTS = 200).
- Aucune fonction objectif scalaire optimisée, aucun retour-arrière (backtracking), aucune relaxation Lagrangienne.

### Affectation d'une opération à un poste et un créneau (5 lignes max)

1. L'opération arrive avec un `postId` fixe (issu de `getRoutage` selon le type de menuiserie) — aucun choix de poste, le moteur ne choisit que l'**opérateur** et le **créneau**.
2. Liste des opérateurs compétents = `OperatorSkill` × `workPostId` (`scheduling-backward.ts:148-152`) ou fallback par phase (coupe/frappes/coulissant) via `EQUIPE.competences` (`PlanningAffectations.tsx:864-872`).
3. Choix du nombre d'opérateurs via `chooseNbOps(postId, strategy, levels)` (`work-posts.ts:243-294`) : 1 si poste monolithique, sinon courbe `parallelGain` selon stratégie crash/normal/focus.
4. Pour chaque créneau candidat (½ journée), on filtre : jour ouvré + (si poste ISULA) lun/mar/jeu + capacité poste non saturée + heures hebdo opérateur ≥ 30 min + non-conflit avec un slot déjà posé.
5. Premier créneau qui passe → on pose `nbPers` opérateurs scorés (skill + brain + habit – usage, + bonus 0.5 si `operateur_prefere`). Pas de remise en cause si plus loin dans le tri une étape plus urgente aurait préféré ce créneau.

### Fonction objectif

**ABSENT** au sens d'une fonction scalaire optimisée.

Il y a un **score d'attribution opérateur** local (`PlanningAffectations.tsx:923-926`)  qui pondère skill (0.35) + brain (0.25) + habit (0.2) – useRatio (0.2) + prefBonus (0.5), mais il sert uniquement à choisir QUI parmi les compétents, pas à optimiser un objectif global comme makespan ou retard total. Le moteur s'arrête au premier placement viable, pas au meilleur.

Pas de pénalité de retard ni de coût du `latestFinish` dépassé : si `cursor.date < minStartStr`, la tâche est simplement marquée non placée (`scheduling-backward.ts:206`).

---

## 2. Contraintes réellement encodées

| Contrainte | Prise en compte ? | Où ? |
|---|:---:|---|
| **Précédence entre opérations (DAG)** | ✅ partiel | `ProductionTask.predecessorIds: String[]` (`prisma/schema.prisma:410`) ; lecture dans `computeLatest` (`scheduling-backward.ts:111-128`). `initOrderDag()` la remplit (`commande-adapter.ts:201-271`). Côté `autoAssign` : pas de DAG explicite, ordre simulé via `phaseOrderMap = {coupe:0, montage:1, vitrage:2, logistique:3, isula:4}` (`PlanningAffectations.tsx:744`) + `lastSlotIdxByPhase` (L.901-911). |
| **Réception / disponibilité matière (dates au plus tôt)** | ❌ | `Commande.date_alu / date_pvc / date_accessoires` existent (`prisma/schema.prisma:39-42`). `dateDemarrage()` les lit (`sial-data.ts:481`) mais cette fonction n'est utilisée QUE par `calcCheminCritique` à des fins d'affichage. **Aucun appel dans `autoAssign`** ni dans `backwardSchedule`. Le seul cas où `earliestStart` est posé sur une `ProductionTask` est `laquage_externe = true` (`commande-adapter.ts:141-148`) — pas les jalons matière. |
| **Polyvalence opérateurs** | ✅ | `OperatorSkill(operatorId, workPostId, menuiserieType, level)` (`prisma/schema.prisma:256-267`). Lecture poste exact : `scheduling-backward.ts:143-152` ; fallback compétence/phase : `PlanningAffectations.tsx:864-872`. Niveaux 1/2/3 utilisés par `chooseNbOps` (`work-posts.ts:243`). |
| **Capacité / parallélisme des postes** | ✅ | `WorkPost.capacityMinDay`, `maxOperators`, `parallelism`, `monolithic` (`prisma/schema.prisma:286-306`). Vérification du remplissage cellule : `scheduling-backward.ts:220-226`, `PlanningAffectations.tsx:870-872`. Contrainte ISULA lun/mar/jeu : `scheduling-backward.ts:214-217`, `PlanningAffectations.tsx:867`. |
| **Calendrier de travail (horaires, équipes, fériés, absences)** | ✅ | Fériés : `JOURS_FERIES` (`sial-data.ts:390-419`), `isWorkday()` (`sial-data.ts:441-444`). Heures hebdo opérateur : `EQUIPE[*].h` (`sial-data.ts:368-380`). Vendredi off : `vendrediOff` + `Operator.workingDays` (`prisma/schema.prisma:238`). Absences ponctuelles : `OperatorAbsence` (`prisma/schema.prisma:269-275`) + saisie via `PlanningRH` (`Commande.rhPlan` lu en L.262). Toutes utilisées dans `loadOperatorCapacity()` (`scheduling-utils.ts:142-185`) et dans `autoAssign` (`PlanningAffectations.tsx:801-815`). |
| **Temps de réglage / changement de série (SMED)** | ❌ | `estimateSetupTime()` et `optimizeSequenceForSetup()` existent dans `src/lib/heijunka.ts:186` et L.226. **Aucun appel** depuis `autoAssign` ni `backwardSchedule` (vérifié par `grep` — seul `suggestModeJourSemaine` est utilisé par `Aujourdhui.tsx:8`). Les setups sont calculés mais purement informatifs. |

### Contraintes qui semblent manquantes (en plus du setup et matière déjà ci-dessus)

- **Disponibilité des matières premières comme borne basse** : les jalons `date_alu`/`date_pvc`/`date_accessoires`/`date_panneau_porte`/`date_volet_roulant` (`Commande:39-43`) ne sont pas injectés dans `ProductionTask.earliestStart`. Une commande dont les accessoires arrivent en S+3 peut quand même se voir placer la coupe en S+0.
- **Stocks tampons inter-postes** : modèle `BufferStock` existe (`schema.prisma:480-499`) et est manipulé par `isula-sial-sync.ts` (création/consommation au DONE de I7), mais sa quantité n'est pas une contrainte d'entrée pour le moteur — c'est un effet de bord côté ISULA→SIAL uniquement.
- **Synchronisation ISULA→SIAL à l'unité (par UV)** : c'est traité par `predecessorIds` au niveau du fabItem entier, pas par UV individuelle. Si un fabItem a 6 UV dont 2 prêtes, le moteur attend que les 6 le soient (`isula-sial-sync.ts:38-66`).
- **Date de pose chantier réelle (rendez-vous poseur ferme)** : champ `pose_chantier_date` saisi en UI (Phase 0-A), lu comme deadline (`PlanningAffectations.tsx:762`, `auto-planning.ts:64`), mais aucune notion de fenêtre de tolérance ni de pénalité de retard.
- **Lots peinture / regroupement de coloris** : `coloris_lot` est saisi (`types/commande.ts:25`) mais aucun moteur ne le lit pour minimiser les changements de série.
- **Conditionnement / livraisons multiples (`regroupement_camion`, `chantier_split_autorise`)** : saisis mais non honorés par l'algo (`PlanningAffectations.tsx:756` les ignore lors du tri ; `auto-planning.ts:137-139` les utilise uniquement pour décaler la semaine).
- **Optimisation globale / makespan** : ABSENT.
- **Coût horaire ou priorisation économique** : ABSENT.

---

## 3. Modèle de données (`prisma/schema.prisma`)

### Modèles liés à la planification

| Modèle | Lignes | Rôle |
|---|---|---|
| `Commande` | 29-112 | Modèle legacy. JSON `lignes`, `vitrages`, `hsTemps` + flags `etape_*_ok`/`etape_*_date`. Source de vérité IHM. |
| `Operator` | 235-253 | weekHours, workingDays, defaultSchedule (JSON horaires détaillés). |
| `OperatorSkill` | 255-267 | (operatorId × workPostId × menuiserieType) avec `level` 0-3. |
| `OperatorAbsence` | 269-275 | Absences ponctuelles. |
| `WorkPost` | 277-310 | id, atelier, capacityMinDay, phase, maxOperators, tamponMinAfter, parallelism, parallelGain, monolithic. |
| `Order` / `FabItem` | 312-350 | Modèle industriel cible. Alimenté depuis `Commande` via `syncCommandeToOrder()`. |
| `ProductionTask` | 395-424 | fabItemId × workPostId, estimatedMinutes, predecessorIds, earliestStart, latestFinish, scheduledStart/End. |
| `ScheduleSlot` | 427-441 | (taskId × operatorId × date × halfDay × minutes). Source de vérité des créneaux ½ journée. |
| `BufferStock` | 480-499 | Stocks tampons inter-postes avec liens producteur/consommateur (Phase 1-B). |
| `Tache` | 172-184 | Bibliothèque de temps unitaires (`temps_unitaire`, `unite`, `parallelisable`). |

### Temps standards par opération × poste

**Stockés à deux endroits** :

1. **Code en dur**, valeurs par défaut : `src/lib/sial-data.ts:65-93` (`T_DEFAULTS` = `coupe_profil: 1`, `soudure_cadre: 5`, `ferrage_ouvrant: 10`, etc.). 18 constantes. Recopiées en mutable dans `T` (L.95) qui est ensuite mutée par `applyCustomT()`.
2. **Table `Tache`** en BDD : `prisma/schema.prisma:172-184`. CRUD via `/api/taches` et `/api/taches/[id]`, page admin `/admin/temps-unitaires`. Au premier GET, `T_DEFAULTS` est seedé en BDD (`src/app/api/taches/route.ts:18-29`), puis appliqué côté serveur via `applyCustomT` (L.39-43).

**D'où viennent-ils** :

- Saisie manuelle par l'utilisateur via la page admin `/admin/temps-unitaires`.
- Sinon, valeurs codées initialement (`T_DEFAULTS`).
- Aucun import PRO F2 actif : `src/components/tabs/SaisieCommande.tsx:98-151` contient un parser ad hoc (`parseProF2`) pour récupérer la liste des vitrages depuis du texte collé, mais il ne touche pas aux temps standards.
- Apprentissage via `cerveau` : `src/lib/cerveau.ts` calcule un `ratio` mesuré/théorique par `(typeId | phase)`, exposé via `/api/cerveau/learned-times`. Lu par `routage-production.ts:202-360` dans `getRoutage(…, learned)` (L.221-237) → multiplie le temps théorique par le ratio appris. **Pas branché** dans `backwardSchedule` (paramètre `learned` non passé) ; branché dans `autoAssign` via `learnedTimes` (`PlanningAffectations.tsx:382-385`).

### Compétences / polyvalence opérateurs

**Stockées** dans `OperatorSkill` (`prisma/schema.prisma:255-267`) avec `level` (0=aucun, 1=apprenti, 2=autonome, 3=expert) + clé composite `(operatorId, workPostId, menuiserieType)`.

Source secondaire codée en dur : `EQUIPE` (`sial-data.ts:367-381`) avec un tableau `competences: string[]` par opérateur. Utilisé en fallback par `autoAssign` (`PlanningAffectations.tsx:864-872`) quand `OperatorSkill` est vide.

### Dates de disponibilité matière

**Stockées** sur la commande : `date_alu`, `date_pvc`, `date_accessoires`, `date_panneau_porte`, `date_volet_roulant` (`prisma/schema.prisma:39-43`).

Flags `cmd_*_passee` / `cmd_*_necessaire` / `cmd_*_passee` également (L.51-67).

**Mais pas exploitées** par les moteurs de planning — uniquement par `calcCheminCritique` à des fins d'affichage (chemin critique théorique). Voir §2.

---

## 4. Boucle UI (oracle vs copilote)

### Injection de contraintes par l'utilisateur

| Action | Possible ? | Mécanisme |
|---|:---:|---|
| **Épingler / verrouiller une opération** | ⚠️ partiel | Pas d'épinglage par opération. En revanche : verrouillage **de toute la semaine** via `toggleLock` (`PlanningAffectations.tsx:638-642`), qui pose un flag `locked` persisté sur `lock_<semaine>` (L.290-293, sauvé L.632-635). Quand `locked = true`, `onDrop` et toutes les modifs sont refusées (`L.525`, `L.586`). Granularité = toute la semaine, pas l'opération. |
| **Forcer une priorité** | ✅ | Champ `Commande.priorite` (`schema.prisma:34`, valeurs `chantier_bloque` / `urgente` / `normale`) saisi dans `SaisieCommande`. Pris en compte dans `autoAssign` (`PlanningAffectations.tsx:754, 820`) et indirectement dans `backwardSchedule` via le tri par `latestFinish` (qui dépend de la deadline). |
| **Forcer un opérateur préféré / interdit** | ✅ | Champs `operateur_prefere` / `operateur_interdit` par ligne de commande (`types/commande.ts:33-35`), appliqués dans `tryPlaceEtape` : bonus +0.5 score (`PlanningAffectations.tsx:920-924`), exclusion (`L.874-877`). Pas exposé dans `backwardSchedule`. |
| **Déclarer un opérateur absent** | ✅ | Saisie via la grille `PlanningRH` (route `/api/planning-rh`), stockée dans `PlanningRH.plan` (JSON). Lue par les deux moteurs. Modèle structuré `OperatorAbsence` aussi disponible (`schema.prisma:269`). |
| **Interdire un créneau (poste fermé jour J)** | ❌ | Pas de mécanisme. Seules les contraintes globales (jours fériés via `JOURS_FERIES`, vendredi off, ISULA lun/mar/jeu) sont codées. Aucune UI pour bloquer ponctuellement un poste sur une date. |
| **Drag & drop manuel d'un opérateur** | ✅ | `onDrop` (`L.524-609`) accepte un drop d'opérateur sur une cellule (poste × jour × demi), refusé si `locked`. Conflits inter-cellules signalés par alert (`L.595-600`). |
| **Drag inter-poste / déplacer une tâche** | ✅ | Visible dans `PlanningTimelineWeek.tsx` (drag horizontal + drag handle inter-poste), évoqué dans le code mais sortant du scope ici. |
| **Masquer une tâche** | ✅ | `hiddenTasks: Set<string>` (`L.142`), toggle via L.646-650, persisté avec le lock. |

### Modification manuelle → recalcul ?

**Non, pas automatiquement.**

- Le drag & drop opérateur (`onDrop`) modifie directement `aff` (state local) et appelle `saveAff(newAff)` (`L.605-606`). Il ne déclenche AUCUN appel à `autoAssign` ni `backwardSchedule` pour recalculer le reste.
- Le bouton « Proposition auto (semaines) » et « Planifier backward (créneaux) » doivent être cliqués explicitement par l'utilisateur (`L.692-718`, `L.727`).
- La conséquence : si l'utilisateur déplace Alain sur F2 mardi PM, le moteur ne réorganise PAS les chantiers en aval. Les autres affectations restent telles quelles, et un éventuel conflit (Alain déjà ailleurs) déclenche juste une alert (`L.596-602`).
- À l'inverse, si l'utilisateur relance `autoAssign` après une modif, l'algo **repart de zéro** : `const newAff: AffMap = {}` (`L.743`) — il ne ré-utilise pas l'état modifié à la main. Le verrouillage de la semaine (`locked`) est le seul moyen d'empêcher l'écrasement.

### Explication du « pourquoi » d'une décision

**Oui, mais a posteriori et au niveau du chantier, pas du créneau.**

- Modal `AutoAssignReport` (`PlanningAffectations.tsx:204-214`, rendu L.2009-2050) affiché après chaque `autoAssign` ou `runBackwardSchedule`. Contient :
  - liste `fullyPlaced` (chantiers totalement placés)
  - `partiallyPlaced[]` avec `postesManquants[].raison` (ex. `"aucun créneau dispo (semaine saturée ou tampon impossible)"`, `"aucun opérateur compétent sur F2"`, `"partiel (3/5 créneaux), semaine saturée"`) — `scheduling-backward.ts:154-156` et `PlanningAffectations.tsx:947-948, 952`
  - `notPlaced[]` avec `raison`
  - `opUsage[]` avec taux d'utilisation et flag « Sous-utilisé » si <50 % (`L.2035-2039`), plus la fenêtre mobile `Disponible : Xh Ym` (Phase 2-C).
- Le rapport ne dit PAS *pourquoi le créneau choisi est celui-ci* (ex. « j'ai choisi mardi AM parce que mardi PM Alain est absent et que Michel a un meilleur score »). C'est un « rapport d'échec », pas un « rapport de choix ».
- Affichage du chemin critique théorique par chantier via `calcCheminCritique` (`sial-data.ts:512-599`) → composant `Simulateur.tsx`. Indépendant du moteur de placement.

---

## 5. Synthèse

- **Moteur : glouton.** Aucun solveur. Deux variantes — `autoAssign` (forward, semaine affichée) et `backwardSchedule` (reverse depuis deadline) — toutes deux placent étape par étape avec un tri en amont (priorité/deadline/durée) et acceptent le premier créneau viable. Pas de fonction objectif globale ni de backtracking.
- **Contraintes critiques manquantes** : (1) jalons matière `date_alu`/`pvc`/`accessoires` non câblés dans `earliestStart` ; (2) temps de réglage / changement de série calculés (`estimateSetupTime`) mais jamais consommés par le moteur ; (3) `regroupement_camion`/`split_autorise` saisis mais non honorés au placement fin ; (4) synchro ISULA→SIAL au niveau du fabItem entier, pas de l'UV unitaire ; (5) lots peinture (`coloris_lot`) inertes.
- **UI : oracle one-shot avec re-clic.** L'utilisateur peut épingler la semaine entière (lock), forcer une priorité par commande, déclarer un opérateur absent, désigner un préféré/interdit par ligne, et faire du drag&drop manuel — **mais aucune modif manuelle ne déclenche un recalcul automatique du reste**. Chaque relance d'`autoAssign` repart de zéro. Le « pourquoi » d'une décision est expliqué uniquement en cas d'échec de placement (modal `AutoAssignReport`), pas en cas de succès.

