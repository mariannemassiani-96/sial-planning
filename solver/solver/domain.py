"""Dataclasses du domaine — projection des modèles Prisma vers Python.

Aucune dépendance Prisma : on travaille sur des dataclasses pures pour
faciliter les tests (fixtures) et la séparation lecture BDD / modèle.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Dict, List, Optional


# ── Postes de travail (snapshot de src/lib/work-posts.ts) ─────────────────


@dataclass
class WorkPost:
    id: str                      # ex "C3", "F2", "I7", "U1"
    label: str
    atelier: str                 # "SIAL" | "ISULA"
    phase: str                   # "coupe" | "montage" | "vitrage" | "isula" | "logistique" | "autre"
    capacity_min_day: int        # capacité machine totale par jour
    parallelism: int = 1
    max_operators: Optional[int] = None
    monolithic: bool = False


# ── Opérateur ──────────────────────────────────────────────────────────────


@dataclass
class Operator:
    id: str
    name: str
    week_hours: float            # ex 39, 36, 35, 30
    working_days: List[int] = field(default_factory=lambda: [0, 1, 2, 3, 4])
    # absences ponctuelles : liste de dates ISO (YYYY-MM-DD)
    absences: List[str] = field(default_factory=list)
    # PlanningRH : map "YYYY-MM-DD" → dispo (1.0 = présent, 0 = absent, 0.5 = demi)
    rh: Dict[str, float] = field(default_factory=dict)

    @property
    def vendredi_off(self) -> bool:
        return 4 not in self.working_days


# ── Compétences ────────────────────────────────────────────────────────────


@dataclass
class Skill:
    operator_id: str
    work_post_id: str
    level: int                   # 1=apprenti, 2=autonome, 3=expert


# ── Tâche de production ────────────────────────────────────────────────────


@dataclass
class Task:
    id: str
    fab_item_id: str
    order_id: str
    work_post_id: str
    label: str
    estimated_minutes: int
    sort_order: int
    predecessor_ids: List[str] = field(default_factory=list)
    earliest_start_date: Optional[str] = None   # YYYY-MM-DD si fourni
    latest_finish_date: Optional[str] = None    # YYYY-MM-DD si fourni
    # Calculé par release_dates.py : index demi-journée à partir duquel
    # la tâche peut démarrer.
    release_half_day_index: int = 0


@dataclass
class FabItem:
    id: str
    order_id: str
    menuiserie_type: str         # ex "OB2_PVC", "C3V3R"
    quantity: int
    label: str
    matiere: str                 # "ALU" | "PVC" | "ALU_PVC"


# ── Commande / Order — données utiles au release ───────────────────────────


@dataclass
class OrderMeta:
    id: str                              # Order.id
    ref_pro_f2: str                      # Order.refProF2 (ex "CMD-<commandeId>")
    delivery_date: str                   # YYYY-MM-DD (latestFinish global)
    priority: str = "normale"            # "chantier_bloque" | "urgente" | "normale"
    # Jalons matière (depuis Commande legacy via refProF2 = CMD-<id>)
    date_alu: Optional[str] = None
    date_pvc: Optional[str] = None
    date_accessoires: Optional[str] = None
    date_panneau_porte: Optional[str] = None
    date_volet_roulant: Optional[str] = None
    # Vitrages : liste de (cmd_passee, date_reception, fournisseur)
    vitrages: List[Dict] = field(default_factory=list)


# ── Bundle complet d'entrée du solveur ─────────────────────────────────────


@dataclass
class SolveInput:
    """Tout ce que le solveur a besoin pour planifier."""
    today: date
    horizon_workdays: int = 90
    orders: List[OrderMeta] = field(default_factory=list)
    fab_items: List[FabItem] = field(default_factory=list)
    tasks: List[Task] = field(default_factory=list)
    operators: List[Operator] = field(default_factory=list)
    skills: List[Skill] = field(default_factory=list)
    work_posts: List[WorkPost] = field(default_factory=list)


# ── Sortie ────────────────────────────────────────────────────────────────


@dataclass
class Placement:
    task_id: str
    operator_ids: List[str]
    date_iso: str
    half_day: str            # "AM" | "PM"
    minutes: int             # minutes effectivement posées sur ce slot


@dataclass
class SolveReport:
    placed_tasks: int
    unplaced_tasks: List[Dict]       # [{taskId, reason}]
    total_weighted_lateness: int     # en demi-journées × poids
    makespan_half_days: int
    solve_time_ms: int
    status: str                      # "OPTIMAL" | "FEASIBLE" | "INFEASIBLE" | "UNKNOWN"


@dataclass
class SolveResult:
    placements: List[Placement]
    report: SolveReport
