-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "createAt" SET DEFAULT timezone('Asia/Bangkok', now()),
ALTER COLUMN "updatedAt" SET DEFAULT timezone('Asia/Bangkok', now());

CREATE OR REPLACE FUNCTION set_role_updated_at_thai()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = timezone('Asia/Bangkok', now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_role_updated_at_thai ON "Role";

CREATE TRIGGER set_role_updated_at_thai
BEFORE UPDATE ON "Role"
FOR EACH ROW
EXECUTE FUNCTION set_role_updated_at_thai();
