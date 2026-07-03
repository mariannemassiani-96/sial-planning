"""Test E2E du solveur sur la fixture.

Vérifie :
  - status OPTIMAL ou FEASIBLE
  - toutes les tâches placées
  - zéro violation de contrainte dure
  - aucune tâche ALU avant date_alu
  - aucune tâche ISULA avant date_reception verre
  - V1/V2 démarrent APRÈS I7 (DAG)

Usage : pytest -v   OU   python -m tests.test_validate
"""
from __future__ import annotations

import sys
from datetime import date, timedelta

# Permet de lancer le test depuis /solver/ directement
import os
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.dirname(HERE))

from solver.fixtures import build_fixture
from solver.model import solve
from solver.validate import validate_result
from solver.calendar_idx import build_calendar


def test_fixture_no_hard_violation():
    today = date(2026, 6, 1)  # un lundi
    input_data = build_fixture(today=today)
    result = solve(input_data, time_limit_s=20.0)

    assert result.report.status in ("OPTIMAL", "FEASIBLE"), \
        f"Status inattendu : {result.report.status}"
    assert result.report.placed_tasks == len(input_data.tasks), \
        f"{result.report.placed_tasks} placées / {len(input_data.tasks)} attendues"

    violations = validate_result(input_data, result)
    assert violations == [], f"Violations détectées :\n" + "\n".join(violations)


def test_release_alu_respected():
    """Aucune tâche ALU (C3, C4, P1, M1) ne doit démarrer avant date_alu."""
    today = date(2026, 6, 1)
    input_data = build_fixture(today=today)
    result = solve(input_data, time_limit_s=20.0)

    order = input_data.orders[0]
    date_alu = order.date_alu
    assert date_alu is not None

    halfdays = build_calendar(today, input_data.horizon_workdays)
    hd_by_idx = {hd.index: hd for hd in halfdays}

    alu_tasks = [t for t in input_data.tasks
                 if t.work_post_id in ("C3", "C4", "P1", "M1")
                 and t.fab_item_id == "fi_alu"]
    placements_by_task = {}
    for p in result.placements:
        placements_by_task.setdefault(p.task_id, []).append(p)

    for t in alu_tasks:
        plist = placements_by_task.get(t.id, [])
        if not plist:
            continue
        first_date = min(p.date_iso for p in plist)
        assert first_date >= date_alu, (
            f"Tâche ALU {t.id} démarre {first_date} avant date_alu {date_alu}"
        )


def test_isula_only_mon_tue_thu():
    today = date(2026, 6, 1)
    input_data = build_fixture(today=today)
    result = solve(input_data, time_limit_s=20.0)

    for p in result.placements:
        t = next((x for x in input_data.tasks if x.id == p.task_id), None)
        if not t or not t.work_post_id.startswith("I"):
            continue
        d = date.fromisoformat(p.date_iso)
        assert d.weekday() in (0, 1, 3), (
            f"Tâche ISULA {t.id} placée sur {p.date_iso} (weekday={d.weekday()})"
        )


def test_v2_depends_on_i7():
    """V2 du même fabItem doit démarrer APRÈS la fin de I7."""
    today = date(2026, 6, 1)
    input_data = build_fixture(today=today)
    result = solve(input_data, time_limit_s=20.0)

    placements_by_task = {}
    for p in result.placements:
        placements_by_task.setdefault(p.task_id, []).append(p)

    p_i7 = placements_by_task.get("t_isula_i7", [])
    p_v2 = placements_by_task.get("t_alu_v2", [])
    if not p_i7 or not p_v2:
        return  # tâche pas placée → couvert par test_fixture_no_hard_violation

    end_i7 = max(p.date_iso for p in p_i7)
    start_v2 = min(p.date_iso for p in p_v2)
    assert start_v2 >= end_i7, (
        f"V2 {start_v2} démarre avant ou pendant fin I7 {end_i7}"
    )


def test_no_skill_violation():
    today = date(2026, 6, 1)
    input_data = build_fixture(today=today)
    result = solve(input_data, time_limit_s=20.0)

    skill_set = {(s.operator_id, s.work_post_id) for s in input_data.skills}
    tasks_by_id = {t.id: t for t in input_data.tasks}

    for p in result.placements:
        t = tasks_by_id.get(p.task_id)
        if not t:
            continue
        for oid in p.operator_ids:
            assert (oid, t.work_post_id) in skill_set, (
                f"Op {oid} sur {t.work_post_id} sans skill"
            )


if __name__ == "__main__":
    # Mode standalone : lance les 5 tests et imprime un récap.
    tests = [
        test_fixture_no_hard_violation,
        test_release_alu_respected,
        test_isula_only_mon_tue_thu,
        test_v2_depends_on_i7,
        test_no_skill_violation,
    ]
    failed = 0
    for fn in tests:
        name = fn.__name__
        try:
            fn()
            print(f"  ✓ {name}")
        except AssertionError as e:
            print(f"  ✗ {name}\n      {e}")
            failed += 1
        except Exception as e:
            print(f"  ✗ {name}\n      [ERREUR] {e}")
            failed += 1
    print("─" * 60)
    if failed == 0:
        print(f"✅ {len(tests)} tests OK")
        sys.exit(0)
    else:
        print(f"❌ {failed}/{len(tests)} test(s) en échec")
        sys.exit(1)
