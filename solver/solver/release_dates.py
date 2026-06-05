"""Calcul de la `release_date` (date de disponibilité matière) par tâche.

C'est le correctif CLÉ que le moteur glouton existant ne fait pas :
le solveur impose `start(task) >= release_index(task)`.

Règle par phase (voir README.md §"Règle phase → jalons matière") :

| phase        | jalons regardés                                       |
|--------------|-------------------------------------------------------|
| coupe        | date_alu (si ALU/ALU_PVC), date_pvc (si PVC/ALU_PVC)  |
| montage      | profilés (idem coupe) + date_accessoires              |
| vitrage      | tout précédent + date_panneau_porte/volet_roulant     |
|              |   + min(vitrages[].date_reception) si ISULA externe   |
| isula        | vitrages[] commandés : min(date_reception)            |
| logistique   | tout (aval)                                           |
| autre        | aucun (release = 0)                                   |
"""
from __future__ import annotations

from typing import Dict, List, Optional

from .calendar_idx import HalfDay, index_from_date
from .domain import FabItem, OrderMeta, Task, WorkPost


def _max_date(*dates: Optional[str]) -> Optional[str]:
    """Renvoie la plus grande date ISO non nulle, ou None si tout est nul."""
    valid = [d for d in dates if d]
    return max(valid) if valid else None


def _min_date(*dates: Optional[str]) -> Optional[str]:
    valid = [d for d in dates if d]
    return min(valid) if valid else None


def _profile_release(order: OrderMeta, matiere: str) -> Optional[str]:
    """Date de dispo des profilés pour cette matière."""
    if matiere == "ALU":
        return order.date_alu
    if matiere == "PVC":
        return order.date_pvc
    if matiere == "ALU_PVC":
        return _max_date(order.date_alu, order.date_pvc)
    return None


def _isula_external_release(order: OrderMeta) -> Optional[str]:
    """Si la commande a des vitrages externes (non ISULA), prend la min des
    dates de réception déclarées. Si fournisseur = isula on retourne None
    (la dispo est gérée par les tasks ISULA elles-mêmes).
    """
    external_dates: List[str] = []
    for v in order.vitrages or []:
        fournisseur = str(v.get("fournisseur", "")).lower()
        if fournisseur == "isula":
            continue
        if v.get("cmd_passee") and v.get("date_reception"):
            external_dates.append(str(v["date_reception"]))
    if not external_dates:
        return None
    return min(external_dates)


def _isula_internal_release(order: OrderMeta) -> Optional[str]:
    """Date dispo verre pour la chaîne ISULA — c'est le verre BRUT, pas l'UV."""
    dates: List[str] = []
    for v in order.vitrages or []:
        fournisseur = str(v.get("fournisseur", "")).lower()
        if fournisseur != "isula":
            continue
        # Pour ISULA, la "date_reception" est celle du verre brut.
        if v.get("cmd_passee") and v.get("date_reception"):
            dates.append(str(v["date_reception"]))
    return min(dates) if dates else None


def compute_release_date(
    task: Task,
    fab_item: FabItem,
    order: OrderMeta,
    work_post: WorkPost,
) -> Optional[str]:
    """Calcule la date YYYY-MM-DD à partir de laquelle la tâche peut démarrer.

    Renvoie None si aucune contrainte (release = today).
    """
    phase = work_post.phase or "autre"
    matiere = fab_item.matiere

    if phase == "coupe":
        return _profile_release(order, matiere)

    if phase == "montage":
        return _max_date(
            _profile_release(order, matiere),
            order.date_accessoires,
        )

    if phase == "vitrage":
        # Pose vitrage SIAL : a besoin des profilés + accessoires + (option)
        # panneau porte / volet roulant + UV. Si fournisseur externe, on
        # ajoute sa date de réception. Si ISULA, on s'appuie sur la précédence
        # par predecessorIds (DAG) plutôt que sur une release date.
        return _max_date(
            _profile_release(order, matiere),
            order.date_accessoires,
            order.date_panneau_porte,
            order.date_volet_roulant,
            _isula_external_release(order),
        )

    if phase == "isula":
        return _isula_internal_release(order)

    if phase == "logistique":
        # CQ final, emballage, palettes, chargement — tout l'amont
        return _max_date(
            _profile_release(order, matiere),
            order.date_accessoires,
            order.date_panneau_porte,
            order.date_volet_roulant,
            _isula_external_release(order),
            _isula_internal_release(order),
        )

    return None


def attach_release_indices(
    tasks: List[Task],
    fab_items_by_id: Dict[str, FabItem],
    orders_by_id: Dict[str, OrderMeta],
    work_posts_by_id: Dict[str, WorkPost],
    halfdays: List[HalfDay],
) -> None:
    """Mute chaque task pour positionner `release_half_day_index`."""
    for t in tasks:
        fi = fab_items_by_id.get(t.fab_item_id)
        if not fi:
            t.release_half_day_index = 0
            continue
        order = orders_by_id.get(fi.order_id)
        wp = work_posts_by_id.get(t.work_post_id)
        if not order or not wp:
            t.release_half_day_index = 0
            continue

        # earliestStart explicite prime sur la règle (ex : laquage_externe)
        if t.earliest_start_date:
            t.release_half_day_index = index_from_date(halfdays, t.earliest_start_date)
            continue

        release_date = compute_release_date(t, fi, order, wp)
        if release_date is None:
            t.release_half_day_index = 0
        else:
            t.release_half_day_index = index_from_date(halfdays, release_date)
