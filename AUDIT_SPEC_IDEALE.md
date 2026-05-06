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

- **deux modèles de données coexistent** sans pont opérationnel : un legacy
  `Commande` (JSON `lignes` / `vitrages`) qui sert à 100 % de l'IHM, et un
  schéma industriel `Order` / `FabItem` / `ProductionTask` / `QCCheck` /
  `BufferStock` / `NonConformity` qui n'est **que lu** (stats) — aucun write
  applicatif n'y va. C'est le premier blocage à lever pour avancer.
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
- **PRO F2** est mentionné dans la SaisieCommande mais aucun import XML/CSV
  n'existe ; **Odoo** est branché en RPC mais la sync sert à pousser des
  données, pas à tirer des OF.

---

## 2. Tableau de conformité

Légende : ✅ OK · ⚠️ Partiel · ❌ Absent.

### 2.1 — Sources de données (intrants)

| Fonctionnalité | Statut | Commentaire |
|---|:---:|---|
| Import PRO F2 (XML/CSV) → ordres de fab | ❌ | Aucun parser. Saisie manuelle dans `SaisieCommande.tsx` ou import CSV maison (`/api/import-csv`) sans schéma PRO F2. |
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

### P0 — Bloquants (à faire avant le reste)

1. **Importer les OF depuis PRO F2** (XML/CSV). Sans ça, AJ ressaisit chaque
   commande à la main → mortalité du flux. Brancher sur `Order` + `FabItem`
   (le schéma existe déjà). Voir §4.1.
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
10. **Polling Odoo** des OF entrants (cron horaire) → push dans `Order`.
11. **Fenêtres mobiles d'opérateur** : afficher les minutes restantes par
    op dans le rapport visuel pour qu'AJ voie immédiatement « Bruno : 4 h
    libres mardi PM ».

---

## 4. Implémentations concrètes pour les 3 écarts critiques

### 4.1 Import PRO F2 (XML) → `Order` / `FabItem`

#### Schéma Prisma — additions

```prisma
// Source d'un OF (PRO F2 = ERP menuiserie) — à ajouter à Order
model Order {
  // ... existant ...
  source        OrderSource    @default(MANUEL)
  sourceRef     String?        // n° d'OF dans PRO F2
  sourceImport  ProF2Import?   @relation(fields: [sourceImportId], references: [id])
  sourceImportId String?
}

enum OrderSource {
  MANUEL
  PRO_F2
  ODOO
}

model ProF2Import {
  id           String    @id @default(cuid())
  filename     String
  importedAt   DateTime  @default(now())
  importedBy   String
  rawXml       String    // archivage pour rejouer si besoin
  ordersCount  Int       @default(0)
  itemsCount   Int       @default(0)
  errors       Json?     // [{ line, code, message }]
  orders       Order[]
}
```

#### Pseudo-code parser (`src/lib/pro-f2-import.ts`)

```ts
import { parseXml } from "fast-xml-parser"; // npm i fast-xml-parser
import prisma from "@/lib/prisma";

interface ProF2Order {
  numero: string;          // sourceRef
  client: string;
  refChantier: string;
  dateLivraison: string;   // DD/MM/YYYY
  lignes: ProF2Ligne[];
}

interface ProF2Ligne {
  type: string;            // "OB2_PVC", "C3V3R", ...
  largeurMm: number;
  hauteurMm: number;
  quantite: number;
  vitrageFournisseur?: "isula" | "externe";
  isSpecial?: boolean;
}

const TYPE_MAP: Record<string, MenuiserieType> = {
  "OB2_PVC": "OB2_PVC",
  "C3V3R":   "C3V3R",
  // ... à compléter avec le mapping PRO F2 → enum local
};

export async function importProF2Xml(xml: string, importedBy: string) {
  const parsed = parseXml(xml, { ignoreAttributes: false });
  const orders = mapProF2(parsed); // implémentation selon DTD PRO F2
  const importRow = await prisma.proF2Import.create({
    data: { filename: "upload", rawXml: xml, importedBy, ordersCount: 0, itemsCount: 0 },
  });

  let nbOrders = 0, nbItems = 0;
  const errors: Array<{ line: string; code: string; message: string }> = [];

  for (const o of orders) {
    try {
      // dédoublonnage : si refProF2 existe déjà → skip
      const exists = await prisma.order.findUnique({ where: { refProF2: o.numero } });
      if (exists) continue;

      await prisma.order.create({
        data: {
          refProF2:     o.numero,
          refChantier:  o.refChantier,
          clientName:   o.client,
          deliveryDate: parseFrDate(o.dateLivraison),
          status:       "A_LANCER",
          source:       "PRO_F2",
          sourceRef:    o.numero,
          sourceImportId: importRow.id,
          items: {
            create: o.lignes.map(l => ({
              menuiserieType: TYPE_MAP[l.type] ?? "HORS_STANDARD",
              quantity:       l.quantite,
              widthMm:        l.largeurMm,
              heightMm:       l.hauteurMm,
              label:          `${l.type} ${l.largeurMm}×${l.hauteurMm}`,
              isSpecial:      !!l.isSpecial,
              matiere:        deduceMatiere(l.type),
            })),
          },
        },
      });
      nbOrders++; nbItems += o.lignes.length;
    } catch (e) {
      errors.push({ line: o.numero, code: "IMPORT_FAIL", message: String(e) });
    }
  }

  await prisma.proF2Import.update({
    where: { id: importRow.id },
    data: { ordersCount: nbOrders, itemsCount: nbItems, errors },
  });

  // ═══════════════════════════════════════════════════════════════════
  // GÉNÉRATION DES ProductionTask — utilise getRoutage existant
  // ═══════════════════════════════════════════════════════════════════
  for (const order of await prisma.order.findMany({
    where: { sourceImportId: importRow.id },
    include: { items: true },
  })) {
    for (const item of order.items) {
      const etapes = getRoutage(item.menuiserieType.toLowerCase(), item.quantity);
      await prisma.productionTask.createMany({
        data: etapes.map((et, i) => ({
          fabItemId:        item.id,
          workPostId:       et.postId,
          label:            et.label,
          estimatedMinutes: et.estimatedMin,
          status:           "PENDING",
          sortOrder:        i,
          isBlocking:       et.phase === "vitrage" && needsIsula(item),
        })),
      });
    }
  }

  return { importId: importRow.id, nbOrders, nbItems, errors };
}
```

#### Route API (`src/app/api/import-prof2/route.ts`)

```ts
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "missing file" }, { status: 400 });
  const xml = await file.text();
  const result = await importProF2Xml(xml, session.user.email);
  return NextResponse.json(result);
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
| P0 | Import PRO F2 → `Order/FabItem` | M | 🔥🔥🔥 |
| P0 | Backward scheduling avec capacité | L | 🔥🔥🔥 |
| P0 | Unifier `Commande` ↔ `Order` | L | 🔥🔥🔥 |
| P1 | DAG `predecessorIds` sur `ProductionTask` | S | 🔥🔥 |
| P1 | Buffer ISULA→SIAL en BDD | M | 🔥🔥 |
| P1 | Externaliser temps unitaires | S | 🔥🔥 |
| P1 | Reporting retards en cours | S | 🔥 |
| P2 | Split 7 étapes SIAL strict | M | 🔥 |
| P2 | Heijunka effectif | M | 🔥 |
| P2 | Polling Odoo OF | S | 🔥 |
| P2 | Fenêtres mobiles op dans rapport | XS | 🔥 |

S = ½ jour · M = 2-3 jours · L = 1 semaine.

**Recommandation immédiate** : commencer par 4.1 (import PRO F2) car ça
nourrit `Order/FabItem` qui sont les pré-requis de 4.2 et 4.3. Sans OF en
BDD, le backward scheduling reste théorique.
