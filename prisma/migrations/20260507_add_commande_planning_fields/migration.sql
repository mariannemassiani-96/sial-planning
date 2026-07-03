-- Phase 0-A : ajoute les champs de saisie exhaustive à Commande.
-- Tous nullables ou avec défaut → aucune commande existante n'est invalidée.

ALTER TABLE "Commande"
  ADD COLUMN IF NOT EXISTS "pose_chantier_date"          TEXT,
  ADD COLUMN IF NOT EXISTS "regroupement_camion"         BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS "chantier_split_autorise"     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "controle_qualite_specifique" TEXT,
  ADD COLUMN IF NOT EXISTS "notes_pose"                  TEXT,
  ADD COLUMN IF NOT EXISTS "risque_perso"                TEXT    NOT NULL DEFAULT 'bas';
