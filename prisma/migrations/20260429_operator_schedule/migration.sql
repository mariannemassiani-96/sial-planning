-- Migration : ajoute les horaires détaillés et la date de naissance
-- pour chaque opérateur. Champs nullables, aucune donnée existante touchée.

ALTER TABLE "Operator"
  ADD COLUMN IF NOT EXISTS "defaultSchedule" JSONB,
  ADD COLUMN IF NOT EXISTS "naissance"       TEXT;
