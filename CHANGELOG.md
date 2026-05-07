# CHANGELOG — Implémentation des corrections de l'audit

> Branche : `claude/audit-scheduling-system-mlwtq`
> Date : 2026-05-07
> Référence : `AUDIT_SPEC_IDEALE.md` à la racine.

Toutes les phases ont été implémentées. Compatibilité ascendante respectée :
les commandes existantes continuent à s'afficher et à se modifier sans
intervention. Toutes les nouvelles colonnes ont des valeurs par défaut.

---

## Vérifications finales

| Étape | Résultat |
|---|:---:|
| `npx prisma validate` | ✅ Schema valide |
| `npx prisma migrate status` | ⏳ À exécuter sur la BDD prod (3 nouvelles migrations à appliquer) |
| `npx next build` | ✅ 0 erreur TypeScript, 0 erreur lint critique (1 warning `themeColor` non bloquant sur `/admin/temps-unitaires`) |

---

## Migrations Prisma à appliquer

Dans cet ordre (l'ordre alphabétique du nom de dossier suffit) :

1. `prisma/migrations/20260507_add_commande_planning_fields` — ajoute 6 colonnes à `Commande` (Phase 0-A).
2. `prisma/migrations/20260507_add_backward_scheduling` — ajoute 5 colonnes à `ProductionTask` + crée `ScheduleSlot` (Phase 0-B).
3. `prisma/migrations/20260507_add_buffer_stock_links` — ajoute 5 colonnes à `BufferStock` (Phase 1-B).

Pour les appliquer en production :
```bash
DATABASE_URL=<prod> npx prisma migrate deploy
```

Toutes les migrations utilisent `ADD COLUMN IF NOT EXISTS` ou `CREATE TABLE IF NOT EXISTS` → idempotentes.

---

## Phase 0-A — SaisieCommande exhaustive

**Objectif** : capter tous les attributs nécessaires à l'algo (puisqu'on ne câble pas PRO F2).

**Fichiers modifiés / créés** :
- `prisma/schema.prisma` — 6 nouveaux champs scalaires sur `Commande`.
- `prisma/migrations/20260507_add_commande_planning_fields/migration.sql` — migration ALTER TABLE.
- `src/types/commande.ts` *(nouveau)* — `LigneCommande`, `VitrageCommande`, `emptyLigneCommande`, `emptyVitrageCommande`, `normalizeLigne()`, `normalizeVitrage()`.
- `src/components/tabs/SaisieCommande.tsx` — 3 nouveaux blocs UI (POSE & TRANSPORT, options avancées par ligne, QUALITÉ & RISQUE) + lien menuiserie sur chaque vitrage.
- `src/lib/sial-data.ts` — `verticalMultiplier()`, `detectSpecialMultiplier()` enrichi (largeur × hauteur), `detectLaquageDelaiJours()`.
- `src/lib/auto-planning.ts` — `pose_chantier_date` prime sur `date_livraison_souhaitee`, `regroupement_camion` met montage et logistique en même semaine, `laquage_externe` recule la coupe d'autant de semaines que nécessaire.
- `src/components/tabs/PlanningAffectations.tsx` (`tryPlaceEtape`) — exclut `operateur_interdit`, applique bonus +0.5 score à `operateur_prefere`, force ≥2 ops si `hauteur_mm > 3000` en montage, lit `pose_chantier_date` comme deadline.
- `src/app/api/commandes/route.ts` + `src/app/api/commandes/[id]/route.ts` — `mapToDb` persiste les 6 nouveaux champs, `AUTO_PLANNING_TRIGGERS` étendus.

**Champs nouveaux côté commande** : `pose_chantier_date`, `regroupement_camion`, `chantier_split_autorise`, `controle_qualite_specifique`, `notes_pose`, `risque_perso`.

**Champs nouveaux par ligne** (dans le JSON `lignes`) : `hauteur_mm`, `coloris_lot`, `laquage_externe`, `delai_laquage_jours`, `ferrage_special`, `temps_supp_min`, `operateur_prefere`, `operateur_interdit`, `tampon_apres_min`.

**Champs nouveaux par vitrage** (dans le JSON `vitrages`) : `vitrage_id_ext`, `ligne_menuiserie_id`.

---

## Phase 0-B — Backward scheduling avec capacité

**Objectif** : remplacer les offsets fixes 1 sem par un algo qui recule chaque tâche jusqu'à trouver capacité × compétence.

**Fichiers créés** :
- `prisma/migrations/20260507_add_backward_scheduling/migration.sql` — `ProductionTask` + `ScheduleSlot`.
- `src/lib/scheduling-utils.ts` — `subtractWorkMinutes`, `halfDayBefore/After`, `workdaysBetween`, `add/subtractWorkdays`, `isIsulaDay`, `loadCellLoad()`, `loadOperatorCapacity()`, `isWorkingHalfDay()`.
- `src/lib/scheduling-backward.ts` — `backwardSchedule(orderId)` complet (DAG → tri par latestFinish ASC → boucle reverse → persistance ScheduleSlot) + `backwardScheduleAll()`.
- `src/app/api/scheduling/backward/route.ts` — POST `{ orderId | all: true }`.

**Fichiers modifiés** :
- `prisma/schema.prisma` — `ProductionTask` ajoute `predecessorIds[]`, `earliestStart`, `latestFinish`, `scheduledStart`, `scheduledEnd`. `Operator.scheduleSlots` relation inverse.
- `src/components/tabs/PlanningAffectations.tsx` — bouton "Planifier backward (créneaux)" + `runBackwardSchedule` qui appelle l'API et alimente le modal de rapport. L'ancien bouton "Proposition auto (semaines)" est conservé.

**Décision** : conserver les deux algos en parallèle. Pas de remplacement forcé. AJ peut comparer les sorties et choisir lequel sauvegarder.

---

## Phase 0-C — Unification Commande → Order/FabItem

**Objectif** : projeter chaque `Commande` vers `Order` + `FabItem` + `ProductionTask` à la création / modification.

**Fichiers créés** :
- `src/lib/commande-adapter.ts` — `syncCommandeToOrder(id)` upsert Order par `refProF2 = "CMD-<id>"`, supprime + recrée les FabItem et tasks via `getRoutage()`. `initOrderDag(orderId)` remplit `predecessorIds`. `resyncAllCommandes(batchSize)` pour re-projection globale.
- `src/app/api/admin/resync-all/route.ts` — POST protégé par header `x-admin-key` (env `ADMIN_RESYNC_KEY`).

**Fichiers modifiés** :
- `src/app/api/commandes/route.ts` (POST) — appel `syncCommandeToOrder` best-effort après create.
- `src/app/api/commandes/[id]/route.ts` (PATCH) — idem après update.

**Décision** : sync best-effort (catch → log), ne bloque jamais le retour HTTP. La Commande legacy reste source de vérité pour l'IHM.

---

## Phase 1-A — DAG predecessorIds

**Objectif** : rendre les précédences explicites entre tâches.

**Fichiers modifiés** :
- `src/lib/commande-adapter.ts` — `initOrderDag()` enrichi : chaîne linéaire (sortOrder n-1), V1/V2 SIAL → I7 du même fabItem (priorité) ou tout terminal ISULA de l'order (fallback).
- `src/lib/scheduling-backward.ts` — `computeLatest()` résout déjà les `predecessorIds` cross-fabItems via récursion descendante.

---

## Phase 1-B — Buffer ISULA → SIAL

**Objectif** : matérialiser en BDD la disponibilité des UV ISULA pour bloquer/débloquer les tâches V1/V2.

**Fichiers créés** :
- `prisma/migrations/20260507_add_buffer_stock_links/migration.sql` — 5 colonnes sur `BufferStock`.
- `src/lib/isula-sial-sync.ts` — `onIsulaTaskComplete(taskId)`, `onPoseVitrageStart(taskId)`, `initIsulaSialDependencies(orderId)`.
- `src/app/api/production-tasks/[id]/route.ts` — PATCH `{ status, actualMinutes, blockedReason, scheduledStart, scheduledEnd }`. Hooks ISULA déclenchés selon `(workPostId, status)`.

**Fichiers modifiés** :
- `prisma/schema.prisma` — `BufferStock` ajoute `taskProducerId`, `taskConsumerId`, `fabItemSourceId`, `readyAt`, `consumedAt`.
- `src/lib/commande-adapter.ts` — appelle `initIsulaSialDependencies` après création de l'order (import dynamique pour éviter boucle).

---

## Phase 1-C — Temps unitaires externalisés

**Objectif** : permettre à AJ de calibrer les temps sans déploiement.

**Fichiers créés** :
- `src/app/api/taches/route.ts` — GET (seed à partir de `T_DEFAULTS` si vide, applique `applyCustomT()`, revalidate 60s), POST.
- `src/app/api/taches/[id]/route.ts` — PUT, DELETE.
- `src/app/api/taches/reset/route.ts` — POST (upsert tous les défauts + `resetT()`).
- `src/app/admin/temps-unitaires/page.tsx` — tableau éditable inline + bouton reset.

**Fichiers modifiés** :
- `src/lib/sial-data.ts` — `T` devient `Record<string, number>` mutable, snapshot immuable dans `T_DEFAULTS`. Helpers `applyCustomT()` et `resetT()`.

**Décision** : pas de migration de schéma — la table `Tache` existait déjà. Les valeurs sont seedées au premier GET si vide.

---

## Phase 1-D — Reporting retards en cours

**Objectif** : détecter automatiquement les retards et les afficher dans Aujourd'hui.

**Fichiers créés** :
- `src/app/api/retards/route.ts` — GET retourne `Array<{ commandeId, ref_chantier, client, etape, datePrevu, joursRetard, niveauRetard }>`. Niveau "critical" dès 5 jours.

**Fichiers modifiés** :
- `src/components/tabs/Aujourdhui.tsx` — fetch `/api/retards` au mount, encart rouge en haut "⚠ N chantier(s) en retard" cliquable. N'apparaît pas si 0 retard.

---

## Phase 2-A — Split des 7 étapes SIAL

**Objectif** : aligner les postes sur la gamme opératoire SIAL (Débit · Usinage · Prépa · Assemblage · Pose vitrage · CQ · Emballage).

**Fichiers modifiés** :
- `src/lib/work-posts.ts` — 4 nouveaux postes :
  - `U1` "Usinage / Fraisage" (phase coupe, monolithic)
  - `P1` "Préparation ferrures" (phase montage, monolithic, sortOrder 0)
  - `CQ1` "Contrôle qualité final" (phase logistique, monolithic, sortOrder 0)
  - `EM1` "Emballage / Palettisation" (phase logistique, sortOrder 1)
  Alias sémantique `PHASE_POSE_VITRAGE` exposé.
- `src/lib/routage-production.ts` — `getRoutage` ajoute U1 (ALU uniquement), P1, CQ1, EM1 pour les commandes standard.

**Décision** : conserver `"vitrage"` comme valeur de phase canonique (rétrocompat 100%). `pose_vitrage` est un alias sémantique. Aucune migration de données nécessaire.

`ensureWorkPosts` upsert au démarrage → U1/P1/CQ1/EM1 seront seedés en BDD automatiquement.

---

## Phase 2-B — Heijunka rebalance

**Objectif** : lisser les Frappes sur la semaine au lieu de tout concentrer.

**Fichiers modifiés** :
- `src/lib/auto-planning.ts` — `heijunkaRebalance(weekSlots, predecessorSlotByTask?)` pure. Identifie surchargés (>90%) et sous-chargés (<70%). Déplace en respectant les preds. Borné à 5 itérations.
- `src/lib/scheduling-backward.ts` — branchement en post-traitement avant la persistance ScheduleSlot.

**Décision** : ne pas brancher dans l'ancien `autoAssign` pour ne pas casser son comportement actuel. Disponible pour le backward et future utilisation.

---

## Phase 2-C — Fenêtres mobiles opérateur dans le rapport

**Fichiers modifiés** :
- `src/components/tabs/PlanningAffectations.tsx` (modal `AutoAssignReport`) — chaque carte op affiche maintenant `Disponible : Xh Ym` avec barre de progression colorée :
  - vert > 240 min restantes
  - orange 60-240 min
  - rouge < 60 min

---

## Décisions d'implémentation prises (alternatives envisagées)

1. **Ne pas remplacer `autoAssign` par `backwardSchedule`**.
   *Raison* : le brief impose la rétrocompatibilité 100 %. AJ a besoin de pouvoir comparer les deux. Les boutons sont côte-à-côte avec libellés explicites.

2. **Conserver `Commande` (legacy JSON) comme source de vérité IHM**, projeter vers `Order/FabItem` en best-effort.
   *Alternative envisagée* : migrer les écritures côté Order et garder Commande comme vue dénormalisée. *Trop risqué* — l'IHM est entièrement sur Commande, le retravail serait massif. La projection asymétrique est plus pragmatique.

3. **Ne pas renommer la phase `"vitrage"` en `"pose_vitrage"`**, exposer un alias `PHASE_POSE_VITRAGE` à la place.
   *Raison* : un renommage casserait toutes les données BDD existantes et tous les composants qui matchent par string. L'alias couvre le besoin sémantique du brief sans risque.

4. **Mapping enum `MenuiserieType` strict** dans l'adapter — fallback sur `HORS_STANDARD` si type inconnu.
   *Raison* : robustesse face à de futurs types ajoutés à `TYPES_MENUISERIE` mais pas à l'enum Prisma.

5. **U1 et P1 ajoutés UNIQUEMENT aux commandes standard** dans `getRoutage`.
   *Raison* : les commandes HS et intervention ont leur propre logique de temps (`hsTemps`). Y injecter U1/P1 doublonnerait le temps.

6. **`heijunkaRebalance` pure** (retourne des moves) plutôt que mutant l'état BDD.
   *Raison* : facilite les tests, et l'appelant choisit quand persister.

7. **Sync `Commande → Order` en best-effort** (try/catch silencieux dans la route).
   *Raison* : un échec de sync ne doit pas casser la création de la Commande, qui est l'opération critique pour AJ.

8. **`ADMIN_RESYNC_KEY` requis pour `/api/admin/resync-all`**.
   *Raison* : opération destructive (delete + recreate de tous les fabItems et tasks). Une simple session NextAuth n'est pas suffisante.

---

## Tests à exécuter manuellement après déploiement

1. Appliquer les 3 migrations Prisma sur la BDD prod (`npx prisma migrate deploy`).
2. Démarrer l'app — `ensureWorkPosts` seedera U1/P1/CQ1/EM1.
3. Créer une commande via SaisieCommande avec :
   - `pose_chantier_date` renseignée (différente de livraison)
   - une ligne avec `hauteur_mm = 3500`
   - une ligne avec `laquage_externe = true` et `delai_laquage_jours = 7`
   - un opérateur préféré
   - `regroupement_camion = true`
4. Vérifier en BDD : `Commande` créée avec les 6 nouveaux champs, puis `Order` + `FabItem` + `ProductionTask` correspondants (idem pour les vitrages → `BufferStock`).
5. Appeler `POST /api/scheduling/backward { all: true }` → vérifier que des `ScheduleSlot` sont créés et que `scheduledStart/End` sont remplis sur les tasks.
6. Simuler `PATCH /api/production-tasks/<id_de_I7> { status: "DONE" }` → vérifier création d'un `BufferStock` `VITRAGES_ISULA` avec `readyAt`, déblocage des V1/V2 du fabItem (`status: PENDING`, `blockedReason: null`), et création d'un `MemoAction`.
7. Appeler `GET /api/retards` → format JSON correct, tri critical d'abord.
8. Vérifier que l'ancienne "Proposition auto (semaines)" fonctionne encore (placement classique sur la semaine affichée).
9. Page `/admin/temps-unitaires` → tableau éditable, modifier `coupe_profil`, valider, recharger : valeur conservée.

---

## Vue d'ensemble des fichiers (livrables)

**Schéma** :
- `prisma/schema.prisma` *(modifié)*
- `prisma/migrations/20260507_add_commande_planning_fields/migration.sql` *(nouveau)*
- `prisma/migrations/20260507_add_backward_scheduling/migration.sql` *(nouveau)*
- `prisma/migrations/20260507_add_buffer_stock_links/migration.sql` *(nouveau)*

**Lib** :
- `src/types/commande.ts` *(nouveau)*
- `src/lib/scheduling-utils.ts` *(nouveau)*
- `src/lib/scheduling-backward.ts` *(nouveau)*
- `src/lib/commande-adapter.ts` *(nouveau)*
- `src/lib/isula-sial-sync.ts` *(nouveau)*
- `src/lib/sial-data.ts` *(modifié)*
- `src/lib/auto-planning.ts` *(modifié)*
- `src/lib/work-posts.ts` *(modifié)*
- `src/lib/routage-production.ts` *(modifié)*

**Routes API** :
- `src/app/api/scheduling/backward/route.ts` *(nouveau)*
- `src/app/api/admin/resync-all/route.ts` *(nouveau)*
- `src/app/api/production-tasks/[id]/route.ts` *(nouveau)*
- `src/app/api/taches/route.ts` *(nouveau)*
- `src/app/api/taches/[id]/route.ts` *(nouveau)*
- `src/app/api/taches/reset/route.ts` *(nouveau)*
- `src/app/api/retards/route.ts` *(nouveau)*
- `src/app/api/commandes/route.ts` *(modifié)*
- `src/app/api/commandes/[id]/route.ts` *(modifié)*

**UI** :
- `src/app/admin/temps-unitaires/page.tsx` *(nouveau)*
- `src/components/tabs/SaisieCommande.tsx` *(modifié)*
- `src/components/tabs/PlanningAffectations.tsx` *(modifié)*
- `src/components/tabs/Aujourdhui.tsx` *(modifié)*

Total : 14 fichiers nouveaux, 9 modifiés, 3 migrations SQL.
