-- AlterTable
-- Existing accounts (password-registered family members) keep upload rights.
ALTER TABLE "User" ADD COLUMN "canUpload" BOOLEAN NOT NULL DEFAULT true;
