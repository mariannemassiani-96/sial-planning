"""Vérifie qu'un SolveResult ne viole AUCUNE contrainte dure.

Renvoie une liste de violations (vide = tout est OK).
À utiliser systématiquement avant de persister un planning.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Set

from .calendar_idx import HalfDay, build_calendar, is_workday
from .domain import SolveInput, SolveResult


def _index_halfdays(halfdays: List[HalfDay]) -> Dict[tuple, HalfDay]:
    return {(hd.date_iso, hd.half): hd for hd in halfdays}


def validate_result(
    input_data: SolveInput,
    result: SolveResult,
) -> List[str]:
    """Renvoie la liste des violations. Vide = OK."""
    violations: List[str] = []

    halfdays = build_calendar(input_data.today, input_data.horizon_workdays)
    idx_by_dh = _index_halfdays(halfdays)

    # Index utiles
    tasks_by_id = {t.id: t for t in input_data.tasks}
    fab_items_by_id = {fi.id: fi for fi in input_data.fab_items}
    orders_by_id = {o.id: o for o in input_data.orders}
    posts_by_id = {p.id: p for p in input_data.work_posts}
    skills_set: Set[tuple] = {
        (s.operator_id, s.work_post_id)
        for s in input_data.skills if s.level >= 1
    }
    ops_by_id = {o.id: o for o in input_data.operators}

    # Reconstituer (start_index, end_index) par tâche à partir des placements
    # Une tâche peut avoir N placements (un par demi-jour × opérateur).
    placements_by_task: Dict[str, list] = defaultdict(list)
    for p in result.placements:
        placements_by_task[p.task_id].append(p)

    task_span: Dict[str, tuple] = {}   # task_id → (start_idx, end_idx)
    for tid, plist in placements_by_task.items():
        idxs = []
        for p in plist:
            hd = idx_by_dh.get((p.date_iso, p.half_day))
            if hd is None:
                violations.append(
                    f"[CAL] tâche {tid} placée sur {p.date_iso} {p.half_day} "
                    f"qui n'est pas un demi-jour ouvré"
                )
                continue
            idxs.append(hd.index)
        if idxs:
            task_span[tid] = (min(idxs), max(idxs) + 1)

    # ── Contrainte 1 : précédence ──────────────────────────────────────
    for t in input_data.tasks:
        if t.id not in task_span:
            continue
        s_t, _ = task_span[t.id]
        for pred_id in t.predecessor_ids:
            if pred_id not in task_span:
                continue
            _, e_pred = task_span[pred_id]
            if e_pred > s_t:
                violations.append(
                    f"[PRÉCÉDENCE] {pred_id} (fin {e_pred}) > {t.id} (début {s_t})"
                )

    # ── Contrainte 2 : release matière ─────────────────────────────────
    for t in input_data.tasks:
        if t.id not in task_span:
            continue
        s, _ = task_span[t.id]
        if s < t.release_half_day_index:
            violations.append(
                f"[RELEASE] {t.id} démarre à idx {s} avant release "
                f"{t.release_half_day_index}"
            )

    # ── Contrainte 3 : capacité poste par demi-jour ────────────────────
    # Pour chaque (post, halfday_index), nombre de tâches actives ≤ parallelism
    post_load: Dict[tuple, int] = defaultdict(int)
    for tid, (s, e) in task_span.items():
        t = tasks_by_id.get(tid)
        if not t:
            continue
        for idx in range(s, e):
            post_load[(t.work_post_id, idx)] += 1

    for (post_id, idx), n in post_load.items():
        wp = posts_by_id.get(post_id)
        if not wp:
            continue
        cap = 1 if wp.monolithic else (wp.parallelism or 1)
        if wp.max_operators is not None:
            cap = min(cap, wp.max_operators)
        if n > cap:
            violations.append(
                f"[CAPACITÉ] {post_id} idx {idx} : {n} tâches simultanées > "
                f"capacité {cap}"
            )

    # ── Contrainte 4 : compétence ──────────────────────────────────────
    placed_ops: Set[tuple] = set()
    for p in result.placements:
        t = tasks_by_id.get(p.task_id)
        if not t:
            continue
        for op_id in p.operator_ids:
            placed_ops.add((p.task_id, op_id))

    for (tid, op_id) in placed_ops:
        t = tasks_by_id.get(tid)
        if not t:
            continue
        if (op_id, t.work_post_id) not in skills_set:
            violations.append(
                f"[COMPÉTENCE] op {op_id} affecté à {tid} sur {t.work_post_id} "
                f"sans skill"
            )

    # ── Contrainte 5 : calendrier opérateur ────────────────────────────
    # Aucun placement sur un jour où l'op est absent / vendredi off / RH=0
    for p in result.placements:
        op = ops_by_id.get(p.operator_ids[0]) if p.operator_ids else None
        if not op:
            continue
        date_iso = p.date_iso
        if not is_workday_iso(date_iso):
            violations.append(
                f"[CALENDRIER] op {op.id} placé sur {date_iso} non ouvré"
            )
            continue
        # Vendredi off
        from datetime import date as _date
        d = _date.fromisoformat(date_iso)
        if op.vendredi_off and d.weekday() == 4:
            violations.append(
                f"[CALENDRIER] op {op.id} (vendrediOff) placé sur ven {date_iso}"
            )
        # Absences
        if date_iso in op.absences:
            violations.append(
                f"[CALENDRIER] op {op.id} placé sur date d'absence {date_iso}"
            )
        # PlanningRH
        dispo = op.rh.get(date_iso)
        if dispo is not None and dispo <= 0:
            violations.append(
                f"[CALENDRIER] op {op.id} placé sur RH-absent {date_iso}"
            )

    # ── Contrainte 6 : ISULA lun/mar/jeu ───────────────────────────────
    for p in result.placements:
        t = tasks_by_id.get(p.task_id)
        if not t or not t.work_post_id.startswith("I"):
            continue
        from datetime import date as _date
        d = _date.fromisoformat(p.date_iso)
        if d.weekday() not in (0, 1, 3):
            violations.append(
                f"[ISULA] tâche {t.id} ({t.work_post_id}) placée sur "
                f"{p.date_iso} (weekday={d.weekday()})"
            )

    return violations


def is_workday_iso(iso: str) -> bool:
    from datetime import date as _date
    return is_workday(_date.fromisoformat(iso))
