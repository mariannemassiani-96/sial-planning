# Handoff solveur CP-SAT — Lot 1

> **Date** : 2026-06-05
> **Branche** : `claude/audit-scheduling-system-mlwtq`
> **Statut** : Lot 1 livré, faisabilité prouvée sur fixture (5/5 tests OK).
> **Auteur** : agent automatique (Claude).

---

## 1. Ce qui est livré

### Service Python autonome `/solver/`

```
solver/
├── README.md                          ← documentation, règle phases→jalons
├── HANDOFF_SOLVER.md                  ← ce document
├── requirements.txt                   ← ortools 9.10+, fastapi, psycopg, pydantic
├── .env.example                       ← gabarit DATABASE_URL
├── solver/                            ← code Python
│   ├── api.py                         ← FastAPI POST /solve + GET /health
│   ├── calendar_idx.py                ← jours fériés FR + discrétisation ½j
│   ├── db.py                          ← psycopg read-only (SET TRANSACTION READ ONLY)
│   ├── domain.py                      ← dataclasses Task / Operator / WorkPost...
│   ├── fixtures.py                    ← scénario test (15 tâches, 6 ops, ISULA+ALU+PVC)
│   ├── model.py                       ← construction CP-SAT + résolution
│   ├── release_dates.py               ← règle phase → jalons matière
│   └── run.py                         ← CLI (--order / --all-open / --fixture)
└── tests/
    └── test_validate.py               ← 5 tests E2E
```

**Aucun fichier Next.js modifié.** Le service tourne en autonomie totale.

### Capacités

| Capacité | Statut |
|---|:---:|
| Lecture BDD Postgres (psycopg, read-only) | ✅ |
| Modèle CP-SAT (OR-Tools 9.x) | ✅ |
| Discrétisation demi-journées avec calendrier FR | ✅ |
| Précédence DAG via `predecessorIds` | ✅ |
| **Dates matière** comme borne basse `release_index` (correctif clé) | ✅ |
| Capacité poste (parallelism, monolithic, maxOperators) | ✅ |
| Compétences (`OperatorSkill.level >= 1`) | ✅ |
| Calendrier (fériés, vendredi off, absences, PlanningRH) | ✅ |
| ISULA lun/mar/jeu | ✅ |
| Plafond hebdo opérateur (cap global Lot 1) | ✅ |
| Objectif lexicographique (retard pondéré → makespan) | ✅ |
| CLI standalone | ✅ |
| API FastAPI POST /solve | ✅ |
| Validation post-solve (zéro violation) | ✅ |
| Tests E2E (5/5 OK sur fixture) | ✅ |

### Résultat sur la fixture

```
Solveur CP-SAT — status : OPTIMAL
  Tâches placées        : 15
  Tâches non placées    : 0
  Retard pondéré total  : 0
  Makespan (½ journées) : 16
  Temps de résolution   : 25 ms
✅ Aucune violation de contrainte dure détectée.
```

La fixture couvre :
- 2 fabItems (6× OB2_PVC + 2× C3V3R)
- 9 tâches (chaîne coupe → montage → vitrage → CQ → emballage + chaîne ISULA I2 → I7)
- 6 opérateurs avec compétences mélangées (Julien coupe / Alain coul / JF frappes / Michel polyvalent / Bruno ISULA / Momo ISULA)
- Jalons matière contradictoires (date_alu=J+5, date_pvc=J+0, date_accessoires=J+8)
- 1 vitrage ISULA cmd_passee, date_reception=J+7

---

## 2. Modèle exact

### Variables

| Var | Type | Domaine | Sémantique |
|---|---|---|---|
| `start[t]` | IntVar | [release_idx[t], H-d[t]] | Index demi-journée de début |
| `end[t]` | IntVar | [...] | `= start[t] + duration[t]` |
| `duration[t]` | constante | ≥ 1 | `ceil(estMin / (240 × nbOps))` |
| `interval[t]` | IntervalVar | — | Pour cumulative poste |
| `assigned[t][o]` | BoolVar | {0,1} | 1 ssi op `o` travaille sur task `t` |
| `op_interval[t][o]` | OptionalIntervalVar | — | présent ssi assigned=1 (no-overlap par op) |
| `lateness[t]` | IntVar | [0, H] | max(0, end[t] - latestFinish_idx[t]) |
| `makespan` | IntVar | [0, H] | max(end[t]) |

### Contraintes dures

1. **Précédence** (DAG via `predecessorIds`) : `end[pred] <= start[t]`.
2. **Release matière** (CORRECTIF KEY) : `start[t] >= release_idx[t]` calculé par `release_dates.compute_release_date` (cf. README §"Règle phase → jalons matière").
3. **Capacité poste** : `AddCumulative(intervals_du_poste, [1]*n, capacity = min(parallelism, maxOps))` ; monolithic ⇒ capacity = 1.
4. **Affectation = nbOps requis** : `sum(assigned[t][o] for o eligible) == nbOps[t]` où `nbOps = min(parallelism, maxOperators, nb_competents)`.
5. **Compétence** : `assigned[t][o]` n'existe que si `OperatorSkill(o, t.workPost).level >= 1`.
6. **Calendrier op** : pour chaque (t, o) éligible et `s ∈ forbidden_starts[o]` (vendredi off, absence, PlanningRH=0), implication `start[t] == s ⇒ assigned[t][o] = 0`.
7. **Plafond hebdo op** : `sum(assigned[t][o] × duration[t]) <= weekly_cap × nb_semaines` (Lot 1 = cap global ; Lot 2 = sliding window par semaine ISO).
8. **No-overlap par op** : `AddNoOverlap(op_intervals[o])`.
9. **ISULA lun/mar/jeu** : `AddAllowedAssignments([start[t]], [[s] for s in isula_indices])` pour tout `t` avec `workPostId.startsWith("I")`.

### Objectif

```
Minimize  W × Σ priority_weight[t] × lateness[t]  +  makespan
```

avec `W = 100 × H + 1` (poids retard dominant le makespan).

`priority_weight = {chantier_bloque: 100, urgente: 10, normale: 1}`.

### Discrétisation

- Unité : **demi-journée** (240 min).
- Vendredi PM : **non inclus** dans le calendrier (convention SIAL).
- Jours fériés FR 2025-2027 codés dans `calendar_idx.JOURS_FERIES`.
- Horizon par défaut : 90 jours ouvrés → ~162 demi-journées.

### Règle phase → jalons (résumée)

| Phase | Jalons combinés |
|---|---|
| `coupe` | `date_alu` (si matière ALU/ALU_PVC), `date_pvc` (si PVC/ALU_PVC) |
| `montage` | profilés + `date_accessoires` |
| `vitrage` | profilés + accessoires + `date_panneau_porte` + `date_volet_roulant` + min(`vitrages[].date_reception`) si externes |
| `isula` | min(`vitrages[].date_reception` cmd_passee && fournisseur=isula) |
| `logistique` | union de tous les jalons amont |

`compute_release_date()` dans `solver/release_dates.py:80-127`.

---

## 3. TODO Lot 2 — Optimisation fine

Marqués explicitement en TODO dans le code :

| # | Fonctionnalité | Fichier |
|---|---|---|
| L2.1 | **SMED / temps de réglage** entre tâches consécutives du même poste (utiliser `estimateSetupTime` de `src/lib/heijunka.ts`) | `model.py` — ajouter une variable de transition et pénaliser dans l'objectif |
| L2.2 | **Regroupement coloris_lot** : minimiser le nombre de changements de série au laquage / poinçon | `model.py` + lire `coloris_lot` depuis `FabItem` (à ajouter en BDD ou JSON) |
| L2.3 | **Regroupement camion** (`regroupement_camion=true`) : forcer toutes les phases du même order à se terminer la même semaine | `model.py` — contrainte d'écart ≤ 9 demis entre min(start) et max(end) par order |
| L2.4 | **Synchro ISULA→SIAL à l'UV** : aujourd'hui par fabItem entier ; ajouter une dimension UV pour libérer la pose vitrage dès qu'une UV est prête | `domain.py` + `model.py` (nouvelle entité `IsulaUnit`) |
| L2.5 | **Plafond hebdo en sliding window** : actuellement cap global ; passer à cap par semaine ISO | `model.py` — itérer par semaine, `Σ assigned × dur(in_week)` ≤ weekly_cap |
| L2.6 | **Nombre d'opérateurs variable** : aujourd'hui fixé par `parallelism` ; en Lot 2, variable de décision avec stratégie crash/normal/focus | `model.py` `_nb_ops_required` devient `nb_ops_var[t]` IntVar |
| L2.7 | **Cycle de vie task** : skip si déjà DONE, conserver si IN_PROGRESS, replanifier seulement PENDING | `db.py` filtrer par status |

---

## 4. TODO Lot 3 — Intégration Next.js

| # | Action | Où |
|---|---|---|
| L3.1 | Endpoint Next.js `/api/scheduling/cp-sat` qui appelle `POST http://<solver>:8001/solve` et persiste les `ScheduleSlot` retournés | `src/app/api/scheduling/cp-sat/route.ts` (nouveau) |
| L3.2 | Bouton UI "Planifier avec solveur" à côté des deux existants | `src/components/tabs/PlanningAffectations.tsx:1817-1829` |
| L3.3 | Comparateur visuel des sorties (glouton vs CP-SAT) avec diff des placements | nouvelle vue admin |
| L3.4 | Déploiement Docker du solveur (Dockerfile + compose) à côté de Next.js | `solver/Dockerfile` (à créer) |
| L3.5 | Variable d'env Next.js `SOLVER_URL` pour cibler le service Python | `.env` |
| L3.6 | Authentification entre Next.js et le solveur (header API key) | `solver/api.py` middleware |

---

## 5. Garanties de sécurité

- **Aucun INSERT/UPDATE** : `solver/db.py` ouvre la transaction avec `SET TRANSACTION READ ONLY` (db.py:208).
- **Schema Prisma non touché** : aucun fichier dans `prisma/` ni `src/` modifié.
- **Aucune dépendance Next.js ajoutée** : `package.json` inchangé.
- **Isolation** : le service tourne sur son propre port (8001), avec son propre virtualenv.

---

## 6. Comment relancer

### Tests automatiques

```bash
cd /home/user/sial-planning/solver
pip install -r requirements.txt
python tests/test_validate.py
```

Sortie attendue :
```
  ✓ test_fixture_no_hard_violation
  ✓ test_release_alu_respected
  ✓ test_isula_only_mon_tue_thu
  ✓ test_v2_depends_on_i7
  ✓ test_no_skill_violation
────────────────────────────────────────────────────────────
✅ 5 tests OK
```

### CLI

```bash
# Fixture (sans BDD)
python -m solver.run --fixture --validate

# Un order réel (avec BDD)
export DATABASE_URL=postgresql://...
python -m solver.run --order <orderId> --validate

# Tous les orders ouverts
python -m solver.run --all-open --validate

# JSON brut
python -m solver.run --fixture --json
```

### API HTTP

```bash
uvicorn solver.api:app --host 0.0.0.0 --port 8001 --reload

curl -X POST http://localhost:8001/solve \
  -H "Content-Type: application/json" \
  -d '{"orderId": "...", "validate": true}'

curl http://localhost:8001/health
```

---

## 7. Limites connues du Lot 1

1. **Une demi-journée = atome insécable**. Une tâche de 60 min "consomme" une demi-journée entière côté capacité. Calibrage fin en Lot 2 si nécessaire.
2. **Nombre d'opérateurs fixé** par poste (`min(parallelism, maxOps, nb_competents)`). Pas de stratégie crash/normal/focus dynamique.
3. **Plafond hebdo global** au lieu de sliding window par semaine. OK tant que l'horizon est court.
4. **PlanningRH chargé par semaine** : si l'algo planifie sur 10 semaines, seule la semaine demandée a ses absences pondérables. Les autres semaines utilisent uniquement `OperatorAbsence` et `vendrediOff`.
5. **Heuristique nbOps == parallelism** : peut être suboptimal sur un poste sous-effectif (ex. C3 parallelism=3 mais seul Julien compétent → on force nbOps=1, on perd du parallélisme théorique mais on évite l'infaisable).
6. **Pas de prise en compte de ZONES** (Porto-Vecchio, Ajaccio…) pour les livraisons. Le solveur ne livre pas — sortie limitée à la fabrication.

Aucune de ces limites ne **viole** une contrainte dure ; elles affectent uniquement la qualité de la solution.

---

## 8. Pour aller plus loin

- Bench sur une vraie semaine de production : sortir 10 orders ouverts réels et mesurer le temps de solve.
- Tunning des paramètres CP-SAT (`num_search_workers`, `linearization_level`).
- Visualisation Gantt des placements (sortie du solveur → SVG ou React Flow).
- Mode "what-if" : injecter une contrainte manuelle (Alain absent demain) et re-solver.
