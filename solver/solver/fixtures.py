"""Fixture synthétique pour tester le solveur sans BDD.

Scénario :
  - 1 order (deliveryDate dans 4 semaines, priorité urgente)
  - 2 fabItems :
      * 6× OB2_PVC (frappes PVC standard)
      * 2× C3V3R (coulissant ALU, vitrage ISULA)
  - Jalons matière contradictoires :
      date_alu = today + 5 j (les profilés ALU arrivent dans 5 jours)
      date_pvc = today + 0
      date_accessoires = today + 8 j
  - 5 opérateurs avec compétences mélangées
  - 1 vitrage ISULA déjà commandé, date_reception = today + 7 j

Vérifie que :
  - aucune tâche ALU ne démarre avant J+5
  - aucune tâche ISULA ne démarre avant J+7
  - les V1/V2 SIAL attendent leur I7 (DAG)
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import List

from .domain import (
    FabItem, Operator, OrderMeta, Skill, SolveInput, Task, WorkPost,
)


def _iso(d: date) -> str:
    return d.isoformat()


def build_fixture(today: date | None = None) -> SolveInput:
    today = today or date.today()
    deliv = today + timedelta(days=28)

    # ── Postes ────────────────────────────────────────────────────────────
    work_posts: List[WorkPost] = [
        WorkPost(id="C3", label="Coupe LMT", atelier="SIAL", phase="coupe",
                 capacity_min_day=1620, parallelism=3, max_operators=3),
        WorkPost(id="C4", label="Coupe 2 têtes", atelier="SIAL", phase="coupe",
                 capacity_min_day=540, parallelism=1, max_operators=1, monolithic=True),
        WorkPost(id="P1", label="Prépa ferrures", atelier="SIAL", phase="montage",
                 capacity_min_day=240, parallelism=1, max_operators=1, monolithic=True),
        WorkPost(id="F2", label="Ouv.+ferrage", atelier="SIAL", phase="montage",
                 capacity_min_day=1080, parallelism=2, max_operators=2),
        WorkPost(id="M1", label="Dorm. couliss.", atelier="SIAL", phase="montage",
                 capacity_min_day=1080, parallelism=2, max_operators=2),
        WorkPost(id="V1", label="Vitr. Frappe", atelier="SIAL", phase="vitrage",
                 capacity_min_day=480, parallelism=2, max_operators=2),
        WorkPost(id="V2", label="Vitr. Coul/Gal", atelier="SIAL", phase="vitrage",
                 capacity_min_day=480, parallelism=2, max_operators=2),
        WorkPost(id="I2", label="Coupe verre", atelier="ISULA", phase="isula",
                 capacity_min_day=840, parallelism=2, max_operators=2),
        WorkPost(id="I7", label="Ctrl CEKAL", atelier="ISULA", phase="isula",
                 capacity_min_day=420, parallelism=1, max_operators=1, monolithic=True),
        WorkPost(id="CQ1", label="CQ final", atelier="SIAL", phase="logistique",
                 capacity_min_day=240, parallelism=1, max_operators=1, monolithic=True),
        WorkPost(id="EM1", label="Emballage", atelier="SIAL", phase="logistique",
                 capacity_min_day=480, parallelism=2, max_operators=2),
    ]

    # ── Opérateurs ────────────────────────────────────────────────────────
    operators: List[Operator] = [
        Operator(id="op_julien", name="Julien", week_hours=39),
        Operator(id="op_alain", name="Alain", week_hours=30,
                 working_days=[0, 1, 2, 3]),  # vendredi off
        Operator(id="op_jf", name="JF", week_hours=39),
        Operator(id="op_michel", name="Michel", week_hours=35),
        Operator(id="op_bruno", name="Bruno", week_hours=39),
        Operator(id="op_momo", name="Momo", week_hours=39),
    ]

    # ── Compétences ──────────────────────────────────────────────────────
    skills: List[Skill] = [
        # Julien : coupe
        Skill(operator_id="op_julien", work_post_id="C3", level=3),
        Skill(operator_id="op_julien", work_post_id="C4", level=3),
        # Alain : coulissants
        Skill(operator_id="op_alain", work_post_id="M1", level=3),
        Skill(operator_id="op_alain", work_post_id="P1", level=2),
        # JF : frappes + vitrage frappe
        Skill(operator_id="op_jf", work_post_id="F2", level=3),
        Skill(operator_id="op_jf", work_post_id="P1", level=2),
        Skill(operator_id="op_jf", work_post_id="V1", level=2),
        Skill(operator_id="op_jf", work_post_id="CQ1", level=2),
        Skill(operator_id="op_jf", work_post_id="EM1", level=2),
        # Michel : frappes
        Skill(operator_id="op_michel", work_post_id="F2", level=2),
        Skill(operator_id="op_michel", work_post_id="V1", level=2),
        Skill(operator_id="op_michel", work_post_id="V2", level=2),
        Skill(operator_id="op_michel", work_post_id="EM1", level=2),
        # Bruno : ISULA + supervision
        Skill(operator_id="op_bruno", work_post_id="I2", level=3),
        Skill(operator_id="op_bruno", work_post_id="I7", level=3),
        Skill(operator_id="op_bruno", work_post_id="CQ1", level=3),
        # Momo : ISULA
        Skill(operator_id="op_momo", work_post_id="I2", level=3),
        Skill(operator_id="op_momo", work_post_id="I7", level=2),
    ]

    # ── Order avec jalons matière contradictoires ───────────────────────
    order = OrderMeta(
        id="order_DEMO",
        ref_pro_f2="CMD-DEMO",
        delivery_date=_iso(deliv),
        priority="urgente",
        date_alu=_iso(today + timedelta(days=5)),
        date_pvc=_iso(today),
        date_accessoires=_iso(today + timedelta(days=8)),
        date_panneau_porte=None,
        date_volet_roulant=None,
        vitrages=[
            {
                "fournisseur": "isula",
                "cmd_passee": True,
                "date_reception": _iso(today + timedelta(days=7)),
                "quantite": 2,
            },
        ],
    )

    # ── FabItems ────────────────────────────────────────────────────────
    fi_pvc = FabItem(
        id="fi_pvc",
        order_id="order_DEMO",
        menuiserie_type="OB2_PVC",
        quantity=6,
        label="OB2 PVC ×6",
        matiere="PVC",
    )
    fi_alu = FabItem(
        id="fi_alu",
        order_id="order_DEMO",
        menuiserie_type="C3V3R",
        quantity=2,
        label="C3V3R ALU ×2",
        matiere="ALU",
    )

    # ── Tasks ────────────────────────────────────────────────────────────
    # Pour fi_pvc (frappes) : C3 → F2 → V1 → CQ1 → EM1
    tasks: List[Task] = []
    pvc_c3 = Task(id="t_pvc_c3", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="C3", label="Coupe LMT PVC",
                  estimated_minutes=300, sort_order=0)
    pvc_p1 = Task(id="t_pvc_p1", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="P1", label="Prépa ferrures PVC",
                  estimated_minutes=120, sort_order=1,
                  predecessor_ids=["t_pvc_c3"])
    pvc_f2 = Task(id="t_pvc_f2", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="F2", label="Ouv+ferrage PVC",
                  estimated_minutes=480, sort_order=2,
                  predecessor_ids=["t_pvc_p1"])
    pvc_v1 = Task(id="t_pvc_v1", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="V1", label="Vitrage frappe PVC",
                  estimated_minutes=240, sort_order=3,
                  predecessor_ids=["t_pvc_f2"])
    pvc_cq = Task(id="t_pvc_cq", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="CQ1", label="CQ PVC",
                  estimated_minutes=60, sort_order=4,
                  predecessor_ids=["t_pvc_v1"])
    pvc_em = Task(id="t_pvc_em", fab_item_id="fi_pvc", order_id="order_DEMO",
                  work_post_id="EM1", label="Emballage PVC",
                  estimated_minutes=120, sort_order=5,
                  predecessor_ids=["t_pvc_cq"])
    tasks.extend([pvc_c3, pvc_p1, pvc_f2, pvc_v1, pvc_cq, pvc_em])

    # Pour fi_alu (coulissant) : C3 → C4 → P1 → M1 → V2 → CQ1 → EM1
    # plus tasks ISULA I2 → I7 dont V2 dépend
    alu_c3 = Task(id="t_alu_c3", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="C3", label="Coupe LMT ALU",
                  estimated_minutes=180, sort_order=0)
    alu_c4 = Task(id="t_alu_c4", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="C4", label="Coupe 2t ALU",
                  estimated_minutes=120, sort_order=1,
                  predecessor_ids=["t_alu_c3"])
    alu_p1 = Task(id="t_alu_p1", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="P1", label="Prépa ferrures ALU",
                  estimated_minutes=60, sort_order=2,
                  predecessor_ids=["t_alu_c4"])
    alu_m1 = Task(id="t_alu_m1", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="M1", label="Dormants coul",
                  estimated_minutes=240, sort_order=3,
                  predecessor_ids=["t_alu_p1"])
    isula_i2 = Task(id="t_isula_i2", fab_item_id="fi_alu", order_id="order_DEMO",
                    work_post_id="I2", label="Coupe verre",
                    estimated_minutes=120, sort_order=4)
    isula_i7 = Task(id="t_isula_i7", fab_item_id="fi_alu", order_id="order_DEMO",
                    work_post_id="I7", label="Ctrl CEKAL",
                    estimated_minutes=60, sort_order=5,
                    predecessor_ids=["t_isula_i2"])
    alu_v2 = Task(id="t_alu_v2", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="V2", label="Vitrage coul",
                  estimated_minutes=180, sort_order=6,
                  predecessor_ids=["t_alu_m1", "t_isula_i7"])
    alu_cq = Task(id="t_alu_cq", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="CQ1", label="CQ ALU",
                  estimated_minutes=60, sort_order=7,
                  predecessor_ids=["t_alu_v2"])
    alu_em = Task(id="t_alu_em", fab_item_id="fi_alu", order_id="order_DEMO",
                  work_post_id="EM1", label="Emballage ALU",
                  estimated_minutes=60, sort_order=8,
                  predecessor_ids=["t_alu_cq"])
    tasks.extend([alu_c3, alu_c4, alu_p1, alu_m1, isula_i2, isula_i7,
                  alu_v2, alu_cq, alu_em])

    return SolveInput(
        today=today,
        horizon_workdays=90,
        orders=[order],
        fab_items=[fi_pvc, fi_alu],
        tasks=tasks,
        operators=operators,
        skills=skills,
        work_posts=work_posts,
    )
