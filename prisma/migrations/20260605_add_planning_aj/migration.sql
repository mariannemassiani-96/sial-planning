-- Planning AJ — grille hebdo simple façon Excel.
-- `data` = JSON avec etapes[], chantiers_extra[], cells{Etape|jour: [...]}.

CREATE TABLE IF NOT EXISTS "PlanningAJ" (
  "semaine"   TEXT         NOT NULL,
  "data"      JSONB        NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlanningAJ_pkey" PRIMARY KEY ("semaine")
);
