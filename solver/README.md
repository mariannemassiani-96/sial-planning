# Service solver CP-SAT — sial-planning

> Service Python autonome qui remplace les moteurs gloutons existants
> (`autoAssign` / `backwardSchedule`) par un vrai solveur d'ordonnancement
> basé sur **OR-Tools CP-SAT**.

**Lot 1 (cette livraison)** : produire un planning **faisable** qui respecte
toutes les contraintes dures + objectif lexicographique
(retard pondéré → makespan).

**Lecture seule** : aucun INSERT/UPDATE. Le service expose un JSON.
La persistance des `ScheduleSlot` reste à la charge du Next.js
(Lot 3 — appel API à venir).

---

## Architecture

```
/solver
├── README.md                    ← ce fichier
├── HANDOFF_SOLVER.md            ← ce qui est livré, TODO Lot 2/3
├── requirements.txt
├── solver/
│   ├── __init__.py
│   ├── api.py                   ← FastAPI (POST /solve)
│   ├── calendar_idx.py          ← jours fériés FR + discrétisation ½j
│   ├── db.py                    ← psycopg readonly
│   ├── domain.py                ← dataclasses Task/Operator/WorkPost…
│   ├── fixtures.py              ← données mock (tests sans BDD)
│   ├── model.py                 ← construction CP-SAT
│   ├── release_dates.py         ← règle phase → jalons matière
│   ├── run.py                   ← CLI principal
│   └── validate.py              ← vérif des contraintes dures post-solve
└── tests/
    └── test_validate.py
```

---

## Installation

```bash
cd solver
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Variables d'env requises (lecture seule) :

```bash
export DATABASE_URL="postgresql://user:pass@host:5432/db"
```

---

## CLI

```bash
# Un seul order
python -m solver.run --order <orderId>

# Tous les orders ouverts (status NOT IN [LIVRE, SUSPENDU])
python -m solver.run --all-open

# Tests sans BDD (utilise fixtures)
python -m solver.run --fixture
```

## API

```bash
uvicorn solver.api:app --host 0.0.0.0 --port 8001
# puis
curl -X POST http://localhost:8001/solve \
  -H "Content-Type: application/json" \
  -d '{"orderId": "..."}'
```

Réponse :
```json
{
  "placements": [
    { "taskId": "abc", "operatorIds": ["op1"], "date": "2026-06-08", "halfDay": "AM", "minutes": 120 }
  ],
  "report": {
    "placedTasks": 12,
    "unplacedTasks": [],
    "totalLateness": 0,
    "makespanHalfDays": 18,
    "solveTimeMs": 234,
    "status": "OPTIMAL"
  }
}
```

---

## Modèle CP-SAT

### Variables

- Pour chaque `ProductionTask` *t* :
  - `start[t]` ∈ `[0, H-1]` (index demi-journée ouvrée, H = horizon)
  - `duration[t]` constante = `ceil(estimatedMinutes / (DEMI_MIN × nbOps))`
  - `end[t] = start[t] + duration[t]`
  - `interval[t]` (IntervalVar)
  - `lateness[t]` ≥ 0 (= max(0, end - latestFinish))
- Pour chaque couple (task *t*, opérateur *o* compétent) :
  - `assigned[t][o]` (BoolVar)
  - `op_interval[t][o]` (optional IntervalVar, présent ssi assigned=1)

### Contraintes dures

1. **Précédence** :
   `end[pred] <= start[t]` pour tout `pred` dans `task.predecessorIds`.

2. **Dates matière** (correctif clé, ABSENT dans l'ancien moteur) :
   `start[t] >= release_index[t]`
   où `release_index` est l'index demi-journée correspondant à `release_date`
   (cf. règle ci-dessous).

3. **Capacité poste** :
   - `AddCumulative(intervals_of_post, capacities=[1]*n, capacity=parallelism)`
   - Si `monolithic=true` : `parallelism = 1` forcé.
   - `maxOperators` limite `sum(assigned[t][o] for o) <= maxOperators[post]`.

4. **Compétence** :
   `assigned[t][o]` n'est créé QUE si `OperatorSkill(o, t.workPostId, *)` existe
   avec `level >= 1`. Sinon variable inexistante = affectation impossible.

5. **Calendrier** :
   - Horizon ne contient QUE des demi-journées ouvrées (weekends + JOURS_FERIES skippés).
   - Pour chaque opérateur *o* et demi-journée *s* indisponible (vendredi off,
     `OperatorAbsence`, `PlanningRH` dispo=0) : `op_interval[t][o]` ne peut pas
     couvrir *s* → on ajoute `start[t] != s OR assigned[t][o] = 0` (via
     `ForbiddenAssignments` ou liste de plages).
   - Plafond hebdo : pour chaque op *o*, pour chaque semaine ISO :
     `sum(assigned[t][o] × duration[t] × DEMI_MIN for t in week) <= weekHoursCap[o]`.

6. **ISULA lun/mar/jeu** :
   `start[t] ∈ ISULA_indices` pour tout *t* dont `workPostId.startsWith("I")`.

7. **latestFinish** : **souple** (cf. objectif).

### Objectif (lexicographique)

```
minimize  W * sum(priority_weight[t] * lateness[t])
        + makespan
```

avec `W` assez grand pour dominer le makespan (W = 100 × horizon par défaut).

Poids priorité :
- `chantier_bloque` = 100
- `urgente` = 10
- `normale` = 1

---

## Règle phase → jalons matière (release dates)

Pour chaque `ProductionTask`, on calcule `release_date` = max des jalons
matière selon la phase du poste et la matière du fabItem.

| Phase poste | Jalons regardés (Commande) | Application |
|---|---|---|
| `coupe` (C1-C6, U1) | `date_alu` si matière ALU/ALU_PVC, `date_pvc` si PVC/ALU_PVC | max des deux pour ALU_PVC |
| `montage` (F1-F3, M1-M3, P1, MHS) | profilés (idem coupe) + `date_accessoires` | max des trois |
| `vitrage` (V1, V2) | profilés + `date_accessoires` + `date_panneau_porte` si porte + `date_volet_roulant` si volet roulant + date_reception vitrage externe (sinon fin ISULA) | max |
| `isula` (I1-I8) | `vitrages[].cmd_passee && date_reception` | min des dates de réception (ISULA peut démarrer dès qu'une UV arrive). |
| `logistique` (CQ1, EM1, L1-L7) | toutes les dates précédentes — c'est l'aval | max |

Si une date est absente (`null`), elle est ignorée (équivaut à
release immédiate). Si toutes sont absentes, `release_index = 0` (today).

La règle vit dans `solver/release_dates.py`. **Documenter ici si AJ veut
ajuster ces règles** (ex. coupe ALU n'a vraiment besoin que des profilés
ALU, pas des accessoires — c'est déjà le cas).

---

## Discrétisation temporelle

- Unité : **demi-journée** (240 min).
- `H = nb demi-journées ouvrées sur l'horizon` (par défaut 90 jours
  ouvrés = ~180 demis).
- Conversion :
  ```
  half_day_index 0 → première demi-journée ouvrée après today (AM)
  half_day_index 1 → idem (PM)
  half_day_index 2 → lendemain ouvré (AM)
  ...
  ```
- Une task de 60 min "occupe" 1 demi-journée entière côté capacité
  (simplification Lot 1, raffinable en Lot 2).
- `duration = ceil(estimatedMinutes / (DEMI_MIN × nbOps))` arrondi
  supérieur, minimum 1.

---

## TODO Lot 2 (optimisation fine)

Voir `HANDOFF_SOLVER.md`. En résumé :

- Temps de réglage / SMED entre tâches du même poste (`estimateSetupTime`).
- Regroupement coloris (`coloris_lot` → minimiser changements).
- Regroupement camion (`regroupement_camion` → toutes les phases finissent
  la même semaine).
- Synchro ISULA→SIAL à l'unité UV plutôt que par fabItem entier.
- Lissage Heijunka (déplacement à granularité fine intra-semaine).

## TODO Lot 3 (intégration Next.js)

- Endpoint Next.js qui appelle `POST /solve` puis persiste les
  `ScheduleSlot` (currently côté `scheduling-backward.ts`).
- Bouton UI pour comparer les sorties CP-SAT vs gloutons existants.
- Reconnexion `Order.refProF2 = "CMD-<id>"` ↔ `Commande.id` côté solveur
  (déjà fait dans `solver/db.py:fetch_release_dates`).

---

## Validation

```bash
python -m solver.run --fixture --validate
# ou avec une vraie commande
python -m solver.run --order <orderId> --validate
```

Vérifie zéro violation des contraintes 1-6. Imprime le rapport détaillé
(retard, makespan, temps de solve) ou la liste des violations.

Le test unitaire `tests/test_validate.py` couvre un cas synthétique avec
3 fabItems, 8 tasks, 5 opérateurs, dates matière contradictoires pour
vérifier que `release_index` est bien injecté.
