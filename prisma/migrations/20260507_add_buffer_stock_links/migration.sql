-- Phase 1-B : ajoute la traçabilité ISULA → SIAL sur BufferStock.

ALTER TABLE "BufferStock"
  ADD COLUMN IF NOT EXISTS "taskProducerId"  TEXT,
  ADD COLUMN IF NOT EXISTS "taskConsumerId"  TEXT,
  ADD COLUMN IF NOT EXISTS "fabItemSourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "readyAt"         TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "consumedAt"      TIMESTAMP(3);
