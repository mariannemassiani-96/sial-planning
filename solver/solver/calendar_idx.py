"""Discrétisation temporelle en demi-journées ouvrées.

Convention :
  half_day_index 0 = première demi-journée ouvrée AU PLUS TÔT today AM (ou la suivante si today est WE/férié)
  half_day_index 1 = même jour PM
  half_day_index 2 = lendemain ouvré AM
  ...

ISULA : seuls lun(weekday=0)/mar(1)/jeu(3) sont autorisés.
Vendredi PM (weekday=4 && halfDay=PM) : pas de production (convention SIAL).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import List

# Source de vérité : src/lib/sial-data.ts:390-415
# On recopie ici pour ne pas dépendre du runtime Node.
JOURS_FERIES = {
    # 2025
    "2025-01-01": "Jour de l'An",
    "2025-04-21": "Lundi de Pâques",
    "2025-05-01": "Fête du Travail",
    "2025-05-08": "Victoire 1945",
    "2025-05-29": "Ascension",
    "2025-06-09": "Lundi de Pentecôte",
    "2025-07-14": "Fête Nationale",
    "2025-08-15": "Assomption",
    "2025-11-01": "Toussaint",
    "2025-11-11": "Armistice",
    "2025-12-25": "Noël",
    # 2026
    "2026-01-01": "Jour de l'An",
    "2026-04-06": "Lundi de Pâques",
    "2026-05-01": "Fête du Travail",
    "2026-05-08": "Victoire 1945",
    "2026-05-14": "Ascension",
    "2026-05-25": "Lundi de Pentecôte",
    "2026-07-14": "Fête Nationale",
    "2026-08-15": "Assomption",
    "2026-11-01": "Toussaint",
    "2026-11-11": "Armistice",
    "2026-12-25": "Noël",
    # 2027 (pré-rempli minimal — à compléter)
    "2027-01-01": "Jour de l'An",
    "2027-03-29": "Lundi de Pâques",
    "2027-05-01": "Fête du Travail",
}

DEMI_MIN = 240  # 4 h × 60 min


@dataclass(frozen=True)
class HalfDay:
    index: int
    date_iso: str         # YYYY-MM-DD
    half: str             # "AM" | "PM"
    weekday: int          # 0=lun..6=dim
    is_isula_day: bool    # True si lun/mar/jeu
    is_friday_pm: bool


def is_workday(d: date) -> bool:
    """Lundi-vendredi hors fériés."""
    if d.weekday() >= 5:
        return False
    if d.isoformat() in JOURS_FERIES:
        return False
    return True


def build_calendar(start: date, horizon_workdays: int = 90) -> List[HalfDay]:
    """Construit la liste des demi-journées ouvrées à partir de `start`.

    On compte `horizon_workdays` jours ouvrés (chaque jour → 2 demis sauf
    vendredi qui n'a que l'AM en production). Le vendredi PM n'est PAS
    inclus dans le calendrier — donc pas planifiable.
    """
    halfdays: List[HalfDay] = []
    cursor = start
    counted_workdays = 0
    idx = 0
    # On itère sur des jours, on ajoute les demis valides
    while counted_workdays < horizon_workdays:
        if is_workday(cursor):
            wd = cursor.weekday()
            iso = cursor.isoformat()
            # AM toujours
            halfdays.append(HalfDay(
                index=idx, date_iso=iso, half="AM",
                weekday=wd, is_isula_day=wd in (0, 1, 3),
                is_friday_pm=False,
            ))
            idx += 1
            # PM sauf vendredi (convention SIAL : ven PM = pas de prod)
            if wd != 4:
                halfdays.append(HalfDay(
                    index=idx, date_iso=iso, half="PM",
                    weekday=wd, is_isula_day=wd in (0, 1, 3),
                    is_friday_pm=False,
                ))
                idx += 1
            counted_workdays += 1
        cursor += timedelta(days=1)
        # garde-fou
        if (cursor - start).days > 365:
            break
    return halfdays


def index_from_date(halfdays: List[HalfDay], target_iso: str, half: str = "AM") -> int:
    """Renvoie l'index de la demi-journée correspondant à `target_iso`.

    Si le jour est non ouvré, on prend la PROCHAINE demi-journée ouvrée
    (semantique 'release' : "à partir de cette date").
    Si la date est avant le calendrier → 0.
    Si après → len(halfdays) (irréalisable, sera détecté).
    """
    if not target_iso:
        return 0
    # Cherche la première demi-journée >= target_iso
    for hd in halfdays:
        if hd.date_iso > target_iso:
            return hd.index
        if hd.date_iso == target_iso:
            if half == "AM":
                return hd.index
            # half == PM : prendre PM du même jour si dispo, sinon AM du suivant
            if hd.half == "PM":
                return hd.index
    # date au-delà de l'horizon
    return len(halfdays)


def isula_indices(halfdays: List[HalfDay]) -> List[int]:
    """Liste des index demi-journée où la chaîne ISULA tourne (lun/mar/jeu)."""
    return [hd.index for hd in halfdays if hd.is_isula_day]


def week_iso_of(hd: HalfDay) -> str:
    """Identifiant semaine ISO d'une demi-journée — pour le plafond hebdo."""
    d = date.fromisoformat(hd.date_iso)
    iso_y, iso_w, _ = d.isocalendar()
    return f"{iso_y}-W{iso_w:02d}"
