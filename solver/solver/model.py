"""Construction du modèle CP-SAT et résolution.

Variables, contraintes et objectif décrits dans README.md §"Modèle CP-SAT".
"""
from __future__ import annotations

import math
import time
from collections import defaultdict
from typing import Dict, List, Optional, Set, Tuple

from ortools.sat.python import cp_model

from .calendar_idx import (
    DEMI_MIN, HalfDay, build_calendar, isula_indices, week_iso_of,
)
from .domain import (
    Operator, Placement, SolveInput, SolveReport, SolveResult, Task, WorkPost,
)
from .release_dates import attach_release_indices


# ── Constantes algorithmiques ─────────────────────────────────────────────


PRIORITY_WEIGHT = {
    "chantier_bloque": 100,
    "urgente": 10,
    "normale": 1,
}

# Si latestFinish n'est pas posé, on prend la deliveryDate de l'order.
# Si elle non plus n'est pas dispo, lateness = 0 (objectif neutre).


# ── Helpers ────────────────────────────────────────────────────────────────


def _nb_ops_required(wp: WorkPost, nb_competent_ops: int) -> int:
    """Combien d'opérateurs par tâche sur ce poste (Lot 1: fixé).

    Monolithic → 1, sinon min(parallelism, maxOperators, nb_competents).
    Lot 2 : variable selon stratégie crash/normal/focus.
    """
    if wp.monolithic:
        return 1
    n = wp.parallelism or 1
    if wp.max_operators is not None:
        n = min(n, wp.max_operators)
    # On ne peut pas exiger plus d'ops que d'ops compétents disponibles.
    if nb_competent_ops > 0:
        n = min(n, nb_competent_ops)
    return max(1, n)


def _duration_halfdays(task: Task, nb_ops: int) -> int:
    """Durée en demi-journées = ceil(estMin / (DEMI_MIN × nb_ops)), min 1."""
    if nb_ops <= 0:
        nb_ops = 1
    return max(1, math.ceil(task.estimated_minutes / (DEMI_MIN * nb_ops)))


def _operator_blocked_halfdays(op: Operator, halfdays: List[HalfDay]) -> Set[int]:
    """Indices de demi-journées indisponibles pour cet opérateur.

    Sources :
      - vendredi off (workingDays sans 4)
      - absences ponctuelles (liste de dates)
      - planning RH : dispo 0 sur une date → toute la journée
    """
    blocked: Set[int] = set()
    abs_set = set(op.absences)
    for hd in halfdays:
        if op.vendredi_off and hd.weekday == 4:
            blocked.add(hd.index)
            continue
        if hd.date_iso in abs_set:
            blocked.add(hd.index)
            continue
        rh_dispo = op.rh.get(hd.date_iso)
        if rh_dispo is not None and rh_dispo <= 0:
            blocked.add(hd.index)
    return blocked


def _weekly_cap_halfdays(op: Operator) -> int:
    """Plafond hebdo en NB de demi-journées (équivalent capacité).

    Ex : 39h/semaine = 39 / 4 = 9.75 → 9 demi-journées max.
    """
    return int(op.week_hours // 4)


# ── Construction du modèle ────────────────────────────────────────────────


def solve(input_data: SolveInput, time_limit_s: float = 30.0) -> SolveResult:
    """Construit le modèle CP-SAT, résout, renvoie un SolveResult.

    Lecture seule sur input_data — aucune mutation hors release_half_day_index.
    """
    t0 = time.perf_counter()

    # 1. Calendrier
    halfdays = build_calendar(input_data.today, input_data.horizon_workdays)
    H = len(halfdays)
    isula_set: Set[int] = set(isula_indices(halfdays))

    # Indexations rapides
    fab_items_by_id = {fi.id: fi for fi in input_data.fab_items}
    orders_by_id = {o.id: o for o in input_data.orders}
    posts_by_id = {p.id: p for p in input_data.work_posts}

    # 2. Release dates → indices demi-journée
    attach_release_indices(
        input_data.tasks, fab_items_by_id, orders_by_id, posts_by_id, halfdays,
    )

    # Compétences indexées : skills_by[post_id] = set(op_id)
    skills_by_post: Dict[str, Set[str]] = defaultdict(set)
    for s in input_data.skills:
        if s.level >= 1:
            skills_by_post[s.work_post_id].add(s.operator_id)

    # Opérateurs indisponibles par jour
    op_blocked: Dict[str, Set[int]] = {
        op.id: _operator_blocked_halfdays(op, halfdays)
        for op in input_data.operators
    }

    # 3. Filtrer les tâches "infaisables d'entrée" (renvoyées dans unplaced)
    feasible_tasks: List[Task] = []
    unplaced: List[Dict] = []
    for t in input_data.tasks:
        if t.release_half_day_index >= H:
            unplaced.append({
                "taskId": t.id,
                "reason": f"release matière au-delà de l'horizon ({t.release_half_day_index} >= {H})",
            })
            continue
        wp = posts_by_id.get(t.work_post_id)
        if wp is None:
            unplaced.append({
                "taskId": t.id,
                "reason": f"workPost inconnu : {t.work_post_id}",
            })
            continue
        eligible = skills_by_post.get(t.work_post_id, set())
        if not eligible:
            unplaced.append({
                "taskId": t.id,
                "reason": f"aucun opérateur compétent sur {t.work_post_id}",
            })
            continue
        feasible_tasks.append(t)

    if not feasible_tasks:
        elapsed = int((time.perf_counter() - t0) * 1000)
        return SolveResult(
            placements=[],
            report=SolveReport(
                placed_tasks=0,
                unplaced_tasks=unplaced,
                total_weighted_lateness=0,
                makespan_half_days=0,
                solve_time_ms=elapsed,
                status="INFEASIBLE",
            ),
        )

    # 4. Build CP-SAT
    model = cp_model.CpModel()

    # Variables par tâche
    start: Dict[str, cp_model.IntVar] = {}
    end: Dict[str, cp_model.IntVar] = {}
    duration: Dict[str, int] = {}
    nb_ops: Dict[str, int] = {}
    interval: Dict[str, cp_model.IntervalVar] = {}
    lateness: Dict[str, cp_model.IntVar] = {}
    # Pour chaque tâche, l'index demi-journée latestFinish (en demi-jours)
    lf_index: Dict[str, int] = {}

    for t in feasible_tasks:
        wp = posts_by_id[t.work_post_id]
        nb_comp = len(skills_by_post.get(t.work_post_id, set()))
        n = _nb_ops_required(wp, nb_comp)
        nb_ops[t.id] = n
        d = _duration_halfdays(t, n)
        duration[t.id] = d
        # Bornes : start dans [release, H - d]
        lb = t.release_half_day_index
        ub = max(lb, H - d)
        start[t.id] = model.NewIntVar(lb, ub, f"start_{t.id}")
        end[t.id] = model.NewIntVar(lb + d, ub + d, f"end_{t.id}")
        model.Add(end[t.id] == start[t.id] + d)
        interval[t.id] = model.NewIntervalVar(
            start[t.id], d, end[t.id], f"int_{t.id}"
        )
        # latestFinish : on cherche l'order via fab_item
        fi = fab_items_by_id.get(t.fab_item_id)
        order = orders_by_id.get(fi.order_id) if fi else None
        lf_str = t.latest_finish_date or (order.delivery_date if order else None)
        if lf_str:
            from .calendar_idx import index_from_date
            lf_index[t.id] = index_from_date(halfdays, lf_str, half="PM")
        else:
            lf_index[t.id] = H  # pas de deadline → pas de retard possible
        # lateness = max(0, end - lf_index)
        lateness[t.id] = model.NewIntVar(0, H, f"late_{t.id}")
        # lateness >= end - lf_index
        model.Add(lateness[t.id] >= end[t.id] - lf_index[t.id])

    # 5. CONTRAINTE 1 — Précédence
    # NB : on ne contraint que si pred est aussi dans feasible_tasks.
    feas_ids = {t.id for t in feasible_tasks}
    for t in feasible_tasks:
        for pred_id in t.predecessor_ids:
            if pred_id in feas_ids:
                model.Add(end[pred_id] <= start[t.id])

    # 6. CONTRAINTE 6 — ISULA lun/mar/jeu
    # On force start[t] ∈ isula_set pour les postes ISULA (workPostId.startsWith("I"))
    for t in feasible_tasks:
        if t.work_post_id.startswith("I"):
            allowed = sorted(s for s in isula_set if s <= H - duration[t.id])
            if not allowed:
                # Aucun créneau ISULA dispo : on déclasse
                unplaced.append({
                    "taskId": t.id,
                    "reason": "aucun créneau ISULA (lun/mar/jeu) dans l'horizon",
                })
                # Forcer start à 0 ne suffit pas — on retire la tâche du modèle
                # mais elle a déjà été créée. On la "neutralise" via lateness max
                # et on ignorera son placement au décodage.
                model.Add(lateness[t.id] == 0)
                continue
            model.AddAllowedAssignments([start[t.id]], [[v] for v in allowed])

    # 7. CONTRAINTE 3 — Capacité poste : cumul des intervals par poste
    by_post: Dict[str, List[str]] = defaultdict(list)
    for t in feasible_tasks:
        by_post[t.work_post_id].append(t.id)
    for post_id, t_ids in by_post.items():
        wp = posts_by_id[post_id]
        cap = 1 if wp.monolithic else (wp.parallelism or 1)
        if wp.max_operators is not None:
            cap = min(cap, wp.max_operators)
        cap = max(1, cap)
        demands = [1] * len(t_ids)
        intervals = [interval[tid] for tid in t_ids]
        model.AddCumulative(intervals, demands, cap)

    # 8. CONTRAINTE 4 — Compétence : variables d'affectation par (task, op)
    # `assigned[t][o] = 1` si l'op o travaille sur la task t.
    assigned: Dict[Tuple[str, str], cp_model.IntVar] = {}
    # Pour chaque (t,o) compétent → bool ; sinon variable inexistante.
    for t in feasible_tasks:
        eligible = skills_by_post.get(t.work_post_id, set())
        for op in input_data.operators:
            if op.id not in eligible:
                continue
            assigned[(t.id, op.id)] = model.NewBoolVar(f"asg_{t.id}_{op.id}")
        # Somme = nb_ops_required (exactly N)
        op_vars = [assigned[(t.id, op.id)]
                   for op in input_data.operators
                   if (t.id, op.id) in assigned]
        if not op_vars:
            # Ne devrait pas arriver, eligible était non vide
            continue
        model.Add(sum(op_vars) == nb_ops[t.id])

    # 9. CONTRAINTE 5 — Calendrier opérateur (jours bloqués)
    # Si assigned[(t,o)] = 1, alors start[t] ne doit PAS être dans op_blocked[o]
    # (et toutes les demis [start, start+d) ne doivent pas être dans blocked).
    # Implémentation : pour chaque opérateur o, pour chaque (t, o) éligible :
    #   on liste les indices `s` valides où l'op peut bosser → AddAllowedAssignments
    #   gouverné par `assigned[(t,o)]`.
    # Plus simple : interdire les `start[t] == s` pour s dont [s, s+d) chevauche un blocked.
    for (tid, oid), avar in assigned.items():
        t = next(x for x in feasible_tasks if x.id == tid)
        d = duration[tid]
        blocked = op_blocked[oid]
        if not blocked:
            continue
        # Indices `s` interdits = ceux dont [s, s+d) chevauche un blocked
        forbidden_starts: List[int] = []
        for s in range(0, H):
            if s + d > H:
                break
            slots = set(range(s, s + d))
            if slots & blocked:
                forbidden_starts.append(s)
        if not forbidden_starts:
            continue
        # Implication : avar=1 ⇒ start[t] ∉ forbidden_starts
        # On encode via : pour chaque s interdit, (start == s) ⇒ avar = 0
        for s in forbidden_starts:
            is_at_s = model.NewBoolVar(f"isat_{tid}_{s}")
            model.Add(start[tid] == s).OnlyEnforceIf(is_at_s)
            model.Add(start[tid] != s).OnlyEnforceIf(is_at_s.Not())
            # is_at_s → not avar
            model.AddBoolOr([is_at_s.Not(), avar.Not()])

    # 9 bis. CONTRAINTE 5 (suite) — Plafond hebdo
    # Pour chaque opérateur, pour chaque semaine : somme des durations
    # (×assigned) des tasks dont start est dans cette semaine ≤ cap_hebdo.
    # Approximation Lot 1 : on calcule la somme des durées des tasks que
    # l'op fait sur l'horizon (toutes semaines confondues) sans dépasser
    # weekly_cap × nb_semaines_horizon.
    # Plus simple Lot 1 : pas de window-sliding, juste cap global.
    nb_weeks = max(1, H // 9)   # ~9 demis/semaine
    for op in input_data.operators:
        op_vars: List[cp_model.IntVar] = []
        op_durations: List[int] = []
        for t in feasible_tasks:
            v = assigned.get((t.id, op.id))
            if v is None:
                continue
            op_vars.append(v)
            op_durations.append(duration[t.id])
        if not op_vars:
            continue
        weekly_cap = _weekly_cap_halfdays(op)
        global_cap = weekly_cap * nb_weeks
        # Σ assigned × duration ≤ global_cap
        model.Add(sum(v * d for v, d in zip(op_vars, op_durations)) <= global_cap)

    # 9 ter. Pas deux tâches simultanées pour le même opérateur.
    # Pour chaque op : on crée des intervals optionnels par task, et NoOverlap.
    for op in input_data.operators:
        op_intervals: List[cp_model.IntervalVar] = []
        for t in feasible_tasks:
            v = assigned.get((t.id, op.id))
            if v is None:
                continue
            opt_int = model.NewOptionalIntervalVar(
                start[t.id], duration[t.id], end[t.id], v,
                f"opint_{t.id}_{op.id}",
            )
            op_intervals.append(opt_int)
        if op_intervals:
            model.AddNoOverlap(op_intervals)

    # 10. OBJECTIF LEXICOGRAPHIQUE
    # makespan = max(end[t])
    makespan = model.NewIntVar(0, H, "makespan")
    for t in feasible_tasks:
        model.Add(makespan >= end[t.id])

    # Retard pondéré
    weighted_late_terms: List[Tuple[int, cp_model.IntVar]] = []
    for t in feasible_tasks:
        fi = fab_items_by_id.get(t.fab_item_id)
        order = orders_by_id.get(fi.order_id) if fi else None
        prio = order.priority if order else "normale"
        w = PRIORITY_WEIGHT.get(prio, 1)
        weighted_late_terms.append((w, lateness[t.id]))

    # Coefficient anti-bascule : poids retard >> makespan
    W = 100 * H + 1
    total_lateness = sum(w * v for w, v in weighted_late_terms)
    model.Minimize(W * total_lateness + makespan)

    # 11. Résolution
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = time_limit_s
    solver.parameters.num_search_workers = 4
    status = solver.Solve(model)
    elapsed = int((time.perf_counter() - t0) * 1000)

    status_name = {
        cp_model.OPTIMAL: "OPTIMAL",
        cp_model.FEASIBLE: "FEASIBLE",
        cp_model.INFEASIBLE: "INFEASIBLE",
        cp_model.MODEL_INVALID: "MODEL_INVALID",
        cp_model.UNKNOWN: "UNKNOWN",
    }.get(status, "UNKNOWN")

    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        # Aucune solution
        for t in feasible_tasks:
            unplaced.append({"taskId": t.id, "reason": f"solver={status_name}"})
        return SolveResult(
            placements=[],
            report=SolveReport(
                placed_tasks=0,
                unplaced_tasks=unplaced,
                total_weighted_lateness=0,
                makespan_half_days=0,
                solve_time_ms=elapsed,
                status=status_name,
            ),
        )

    # 12. Décodage des placements
    placements: List[Placement] = []
    for t in feasible_tasks:
        s = solver.Value(start[t.id])
        d = duration[t.id]
        # Opérateurs assignés
        op_ids: List[str] = []
        for op in input_data.operators:
            v = assigned.get((t.id, op.id))
            if v is None:
                continue
            if solver.Value(v) == 1:
                op_ids.append(op.id)

        # Détailler les demi-journées couvertes
        # Lot 1 : on répartit estimated_minutes uniformément sur les `d` demis
        min_per_slot = max(1, math.ceil(t.estimated_minutes / d))
        remaining = t.estimated_minutes
        for k in range(d):
            slot_idx = s + k
            if slot_idx >= H:
                break
            hd = halfdays[slot_idx]
            minutes_here = min(min_per_slot, remaining)
            remaining -= minutes_here
            for oid in op_ids:
                placements.append(Placement(
                    task_id=t.id,
                    operator_ids=[oid],
                    date_iso=hd.date_iso,
                    half_day=hd.half,
                    minutes=minutes_here,
                ))
            if remaining <= 0:
                break

    total_late = sum(
        PRIORITY_WEIGHT.get(
            (orders_by_id.get(fab_items_by_id[t.fab_item_id].order_id).priority
             if t.fab_item_id in fab_items_by_id else "normale"), 1
        ) * solver.Value(lateness[t.id])
        for t in feasible_tasks
    )
    makespan_val = solver.Value(makespan)

    return SolveResult(
        placements=placements,
        report=SolveReport(
            placed_tasks=len(feasible_tasks),
            unplaced_tasks=unplaced,
            total_weighted_lateness=total_late,
            makespan_half_days=makespan_val,
            solve_time_ms=elapsed,
            status=status_name,
        ),
    )
