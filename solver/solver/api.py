"""FastAPI — endpoint POST /solve.

Démarrage :
    uvicorn solver.api:app --host 0.0.0.0 --port 8001

Requête :
    POST /solve  body { "orderId": "..." }       — un order
    POST /solve  body { "allOpen": true }        — tous les orders ouverts
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import date
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .model import solve
from .validate import validate_result

app = FastAPI(
    title="sial-planning solver (CP-SAT)",
    version="0.1.0",
    description="Service Lot 1 : produit un planning faisable. Lecture seule.",
)


class SolveRequest(BaseModel):
    orderId: Optional[str] = Field(None, description="Order.id à planifier")
    allOpen: Optional[bool] = Field(False, description="Tous les orders ouverts")
    semaine: Optional[str] = Field(None, description="Semaine ISO (YYYY-Www)")
    validate: Optional[bool] = Field(True, description="Vérifier contraintes dures")
    timeLimitSec: Optional[float] = Field(30.0, description="Limite de solve")


@app.get("/health")
def health():
    return {"ok": True, "service": "sial-planning-solver", "version": "0.1.0"}


@app.post("/solve")
def post_solve(req: SolveRequest):
    if not req.orderId and not req.allOpen:
        raise HTTPException(400, "orderId ou allOpen requis")
    try:
        from .db import load_input
        input_data = load_input(
            only_order_id=req.orderId,
            only_open=bool(req.allOpen),
            today=date.today(),
            semaine_iso=req.semaine,
        )
    except Exception as e:
        raise HTTPException(500, f"Chargement BDD: {e}")

    if not input_data.tasks:
        return {
            "placements": [],
            "report": {
                "placedTasks": 0, "unplacedTasks": [],
                "totalWeightedLateness": 0, "makespanHalfDays": 0,
                "solveTimeMs": 0, "status": "EMPTY",
            },
            "violations": [],
        }

    result = solve(input_data, time_limit_s=req.timeLimitSec or 30.0)
    violations: List[str] = []
    if req.validate:
        violations = validate_result(input_data, result)

    return {
        "placements": [asdict(p) for p in result.placements],
        "report": {
            "placedTasks": result.report.placed_tasks,
            "unplacedTasks": result.report.unplaced_tasks,
            "totalWeightedLateness": result.report.total_weighted_lateness,
            "makespanHalfDays": result.report.makespan_half_days,
            "solveTimeMs": result.report.solve_time_ms,
            "status": result.report.status,
        },
        "violations": violations,
    }
