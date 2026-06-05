"""CLI principal du solveur.

Usage :
  python -m solver.run --order <orderId>     # un seul order
  python -m solver.run --all-open            # tous les orders ouverts
  python -m solver.run --fixture             # mode test sans BDD
  python -m solver.run --fixture --validate  # idem + vérif des contraintes
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import asdict
from datetime import date

from .domain import SolveInput, SolveResult
from .fixtures import build_fixture
from .model import solve
from .validate import validate_result


def _dataclass_to_dict(obj):
    """Convertit récursivement dataclasses + listes en dict pour JSON."""
    if hasattr(obj, "__dataclass_fields__"):
        return {k: _dataclass_to_dict(v) for k, v in asdict(obj).items()}
    if isinstance(obj, (list, tuple)):
        return [_dataclass_to_dict(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _dataclass_to_dict(v) for k, v in obj.items()}
    return obj


def _print_report(result: SolveResult, violations: list[str] | None = None) -> None:
    rep = result.report
    print("─" * 70)
    print(f"Solveur CP-SAT — status : {rep.status}")
    print(f"  Tâches placées        : {rep.placed_tasks}")
    print(f"  Tâches non placées    : {len(rep.unplaced_tasks)}")
    for u in rep.unplaced_tasks:
        print(f"    • {u.get('taskId')} → {u.get('reason')}")
    print(f"  Retard pondéré total  : {rep.total_weighted_lateness}")
    print(f"  Makespan (½ journées) : {rep.makespan_half_days}")
    print(f"  Temps de résolution   : {rep.solve_time_ms} ms")
    print(f"  Placements            : {len(result.placements)}")
    if violations is not None:
        print("─" * 70)
        if violations:
            print(f"⚠ {len(violations)} VIOLATION(S) DE CONTRAINTE DURE :")
            for v in violations:
                print(f"    {v}")
        else:
            print("✅ Aucune violation de contrainte dure détectée.")
    print("─" * 70)


def _load_input(args) -> SolveInput:
    if args.fixture:
        return build_fixture(today=date.today())
    # Sinon : BDD
    from .db import load_input
    return load_input(
        only_order_id=args.order,
        only_open=args.all_open,
        today=date.today(),
        semaine_iso=args.semaine,
    )


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Solveur CP-SAT pour sial-planning (Lot 1 — faisabilité)."
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--order", help="Order.id à planifier")
    group.add_argument("--all-open", action="store_true",
                       help="Tous les orders non livrés / non suspendus")
    group.add_argument("--fixture", action="store_true",
                       help="Mode test avec données synthétiques")
    parser.add_argument("--validate", action="store_true",
                        help="Vérifier les contraintes dures après résolution")
    parser.add_argument("--time-limit", type=float, default=30.0,
                        help="Limite de temps de résolution en secondes (def 30)")
    parser.add_argument("--json", action="store_true",
                        help="Sortie JSON brute (sinon, rapport humain)")
    parser.add_argument("--semaine", default=None,
                        help="Semaine ISO YYYY-Www pour charger PlanningRH "
                             "(uniquement en mode BDD)")
    args = parser.parse_args(argv)

    try:
        input_data = _load_input(args)
    except Exception as e:
        print(f"❌ Erreur chargement données : {e}", file=sys.stderr)
        return 2

    if not input_data.tasks:
        print("⚠ Aucune tâche à planifier.", file=sys.stderr)
        if args.json:
            print(json.dumps({"placements": [], "report": {
                "placedTasks": 0, "unplacedTasks": [], "totalWeightedLateness": 0,
                "makespanHalfDays": 0, "solveTimeMs": 0, "status": "EMPTY",
            }}))
        return 1

    result = solve(input_data, time_limit_s=args.time_limit)

    violations = None
    if args.validate:
        violations = validate_result(input_data, result)

    if args.json:
        out = {
            "placements": [_dataclass_to_dict(p) for p in result.placements],
            "report": _dataclass_to_dict(result.report),
            "violations": violations if violations is not None else [],
        }
        print(json.dumps(out, indent=2, ensure_ascii=False))
    else:
        _print_report(result, violations)

    if violations:
        return 1
    if result.report.status not in ("OPTIMAL", "FEASIBLE"):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
