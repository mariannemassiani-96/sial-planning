-- Phase 0-B : ajoute les champs backward scheduling sur ProductionTask
-- + crée la table ScheduleSlot.

ALTER TABLE "ProductionTask"
  ADD COLUMN IF NOT EXISTS "predecessorIds"  TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "earliestStart"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "latestFinish"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledStart"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "scheduledEnd"    TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "ScheduleSlot" (
  "id"          TEXT      NOT NULL,
  "taskId"      TEXT      NOT NULL,
  "operatorId"  TEXT      NOT NULL,
  "date"        TIMESTAMP(3) NOT NULL,
  "halfDay"     TEXT      NOT NULL,
  "minutes"     INT       NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduleSlot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ScheduleSlot_date_halfDay_idx"
  ON "ScheduleSlot"("date", "halfDay");

CREATE UNIQUE INDEX IF NOT EXISTS "ScheduleSlot_taskId_operatorId_date_halfDay_key"
  ON "ScheduleSlot"("taskId", "operatorId", "date", "halfDay");

DO $$ BEGIN
  ALTER TABLE "ScheduleSlot"
    ADD CONSTRAINT "ScheduleSlot_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "ProductionTask"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "ScheduleSlot"
    ADD CONSTRAINT "ScheduleSlot_operatorId_fkey"
    FOREIGN KEY ("operatorId") REFERENCES "Operator"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
