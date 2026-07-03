"""Accès lecture seule à la base sial-planning (PostgreSQL).

⚠ Aucune écriture autorisée. Tous les `cursor.execute` sont des SELECT.
La persistance des ScheduleSlot reste côté Next.js (Lot 3).
"""
from __future__ import annotations

import json
import os
from datetime import date
from typing import Dict, List, Optional

try:
    import psycopg
    from psycopg.rows import dict_row
    HAS_PSYCOPG = True
except ImportError:  # pragma: no cover
    HAS_PSYCOPG = False

from .domain import (
    FabItem, Operator, OrderMeta, Skill, SolveInput, Task, WorkPost,
)


def _conn():
    if not HAS_PSYCOPG:
        raise RuntimeError("psycopg n'est pas installé — `pip install -r requirements.txt`.")
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL manquant dans l'environnement.")
    # autocommit + read-only par sécurité supplémentaire
    return psycopg.connect(url, row_factory=dict_row, autocommit=True)


# ── Chargements ────────────────────────────────────────────────────────────


def load_work_posts(cur) -> List[WorkPost]:
    cur.execute("""
        SELECT id, label, atelier::text, "capacityMinDay", phase,
               parallelism, "maxOperators", monolithic
        FROM "WorkPost"
    """)
    out = []
    for r in cur.fetchall():
        out.append(WorkPost(
            id=r["id"],
            label=r["label"],
            atelier=r["atelier"],
            phase=r["phase"] or "autre",
            capacity_min_day=r["capacityMinDay"],
            parallelism=r["parallelism"] or 1,
            max_operators=r["maxOperators"],
            monolithic=bool(r["monolithic"]),
        ))
    return out


def load_operators(cur, semaine_iso: Optional[str] = None) -> List[Operator]:
    cur.execute("""
        SELECT id, name, "weekHours", "workingDays"
        FROM "Operator"
        WHERE active = TRUE
    """)
    ops = {r["id"]: r for r in cur.fetchall()}

    # Absences ponctuelles
    cur.execute("""
        SELECT "operatorId", date::text AS date
        FROM "OperatorAbsence"
    """)
    abs_map: Dict[str, List[str]] = {}
    for r in cur.fetchall():
        abs_map.setdefault(r["operatorId"], []).append(r["date"][:10])

    # PlanningRH : on charge la semaine demandée si fournie
    rh_map: Dict[str, Dict[str, float]] = {}
    if semaine_iso:
        cur.execute(
            'SELECT plan FROM "PlanningRH" WHERE semaine = %s',
            (semaine_iso,),
        )
        row = cur.fetchone()
        if row and row["plan"]:
            plan = row["plan"]
            # Structure : { operatorIdOrKey: { "YYYY-MM-DD": dispo, ... } }
            if isinstance(plan, dict):
                for k, v in plan.items():
                    if isinstance(v, dict):
                        rh_map[k] = {dk: float(dv) for dk, dv in v.items()}

    out = []
    for op_id, r in ops.items():
        out.append(Operator(
            id=op_id,
            name=r["name"],
            week_hours=float(r["weekHours"]),
            working_days=list(r["workingDays"] or [0, 1, 2, 3, 4]),
            absences=abs_map.get(op_id, []),
            rh=rh_map.get(op_id, {}),
        ))
    return out


def load_skills(cur) -> List[Skill]:
    cur.execute("""
        SELECT "operatorId", "workPostId", level
        FROM "OperatorSkill"
        WHERE level >= 1 AND "workPostId" IS NOT NULL
    """)
    return [Skill(
        operator_id=r["operatorId"],
        work_post_id=r["workPostId"],
        level=r["level"],
    ) for r in cur.fetchall()]


def load_orders(cur, only_order_id: Optional[str] = None,
                only_open: bool = False) -> List[OrderMeta]:
    sql = """
        SELECT o.id, o."refProF2", o."deliveryDate"::text AS deliveryDate,
               o.status::text AS status
        FROM "Order" o
        WHERE 1=1
    """
    params: List = []
    if only_order_id:
        sql += " AND o.id = %s"
        params.append(only_order_id)
    if only_open:
        sql += " AND o.status NOT IN ('LIVRE', 'SUSPENDU')"
    sql += " ORDER BY o.\"deliveryDate\" ASC"
    cur.execute(sql, params)
    orders_rows = cur.fetchall()

    # Pour chaque order : retrouver la Commande legacy via refProF2 = "CMD-<commandeId>"
    out: List[OrderMeta] = []
    for r in orders_rows:
        commande_id = None
        ref = r["refProF2"] or ""
        if ref.startswith("CMD-"):
            commande_id = ref[4:]
        priorite = "normale"
        date_alu = date_pvc = date_acc = date_pp = date_vr = None
        vitrages: List[Dict] = []
        if commande_id:
            cur.execute("""
                SELECT priorite, date_alu, date_pvc, date_accessoires,
                       date_panneau_porte, date_volet_roulant,
                       vitrages
                FROM "Commande"
                WHERE id = %s
            """, (commande_id,))
            row = cur.fetchone()
            if row:
                priorite = row["priorite"] or "normale"
                date_alu = row["date_alu"]
                date_pvc = row["date_pvc"]
                date_acc = row["date_accessoires"]
                date_pp = row["date_panneau_porte"]
                date_vr = row["date_volet_roulant"]
                v = row["vitrages"]
                if isinstance(v, list):
                    vitrages = v
                elif isinstance(v, str):
                    try:
                        vitrages = json.loads(v)
                    except Exception:
                        vitrages = []

        out.append(OrderMeta(
            id=r["id"],
            ref_pro_f2=r["refProF2"],
            delivery_date=r["deliveryDate"][:10],
            priority=priorite,
            date_alu=date_alu, date_pvc=date_pvc,
            date_accessoires=date_acc, date_panneau_porte=date_pp,
            date_volet_roulant=date_vr,
            vitrages=vitrages,
        ))
    return out


def load_fab_items_and_tasks(cur, order_ids: List[str]) -> tuple[List[FabItem], List[Task]]:
    if not order_ids:
        return [], []
    cur.execute("""
        SELECT id, "orderId", "menuiserieType"::text AS menuiserieType,
               quantity, label, matiere::text AS matiere
        FROM "FabItem"
        WHERE "orderId" = ANY(%s)
    """, (order_ids,))
    items_rows = cur.fetchall()
    fab_items = [FabItem(
        id=r["id"], order_id=r["orderId"],
        menuiserie_type=r["menuiserieType"], quantity=r["quantity"],
        label=r["label"], matiere=r["matiere"],
    ) for r in items_rows]
    fi_ids = [fi.id for fi in fab_items]
    if not fi_ids:
        return fab_items, []
    cur.execute("""
        SELECT id, "fabItemId", "workPostId", label, "estimatedMinutes",
               sort_order AS "sortOrder",
               "predecessorIds",
               "earliestStart"::text AS "earliestStart",
               "latestFinish"::text AS "latestFinish"
        FROM "ProductionTask"
        WHERE "fabItemId" = ANY(%s)
        ORDER BY sort_order
    """, (fi_ids,))
    tasks_rows = cur.fetchall()
    fi_by_id = {fi.id: fi for fi in fab_items}
    tasks = []
    for r in tasks_rows:
        fi = fi_by_id.get(r["fabItemId"])
        tasks.append(Task(
            id=r["id"],
            fab_item_id=r["fabItemId"],
            order_id=fi.order_id if fi else "",
            work_post_id=r["workPostId"],
            label=r["label"],
            estimated_minutes=int(r["estimatedMinutes"]),
            sort_order=r["sortOrder"],
            predecessor_ids=list(r["predecessorIds"] or []),
            earliest_start_date=r["earliestStart"][:10] if r["earliestStart"] else None,
            latest_finish_date=r["latestFinish"][:10] if r["latestFinish"] else None,
        ))
    return fab_items, tasks


def load_input(
    only_order_id: Optional[str] = None,
    only_open: bool = False,
    today: Optional[date] = None,
    semaine_iso: Optional[str] = None,
) -> SolveInput:
    """Charge tout ce qu'il faut depuis la BDD (lecture seule)."""
    today = today or date.today()
    with _conn() as conn:
        with conn.cursor() as cur:
            # Sécurité supplémentaire : transaction read-only.
            cur.execute("SET TRANSACTION READ ONLY")
            work_posts = load_work_posts(cur)
            operators = load_operators(cur, semaine_iso=semaine_iso)
            skills = load_skills(cur)
            orders = load_orders(cur, only_order_id=only_order_id, only_open=only_open)
            fab_items, tasks = load_fab_items_and_tasks(
                cur, [o.id for o in orders],
            )
    return SolveInput(
        today=today,
        orders=orders,
        fab_items=fab_items,
        tasks=tasks,
        operators=operators,
        skills=skills,
        work_posts=work_posts,
    )
