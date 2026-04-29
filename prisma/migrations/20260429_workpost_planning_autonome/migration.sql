-- Migration : enrichir WorkPost pour la planification autonome.
-- Tous les champs ajoutés sont nullables ou ont une valeur par défaut,
-- de sorte que la migration ne casse pas les requêtes existantes.

ALTER TABLE "WorkPost"
  ADD COLUMN IF NOT EXISTS "shortLabel"     TEXT,
  ADD COLUMN IF NOT EXISTS "phase"          TEXT,
  ADD COLUMN IF NOT EXISTS "maxOperators"   INTEGER,
  ADD COLUMN IF NOT EXISTS "tamponMinAfter" INTEGER,
  ADD COLUMN IF NOT EXISTS "color"          TEXT,
  ADD COLUMN IF NOT EXISTS "visible"        BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "sortOrder"      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "parallelism"    INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "parallelGain"   JSONB,
  ADD COLUMN IF NOT EXISTS "monolithic"     BOOLEAN NOT NULL DEFAULT false;

-- Données initiales : la table sera resynchronisée au prochain démarrage
-- de l'application via `ensureWorkPosts()` (lib/work-posts-server.ts).
-- Aucune action manuelle requise.
