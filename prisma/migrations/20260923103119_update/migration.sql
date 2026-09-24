-- AlterTable
ALTER TABLE "Emp" ALTER COLUMN "createdAt" SET DEFAULT timezone('Asia/Bangkok', now()),
ALTER COLUMN "updatedAt" SET DEFAULT timezone('Asia/Bangkok', now());

-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "createAt" SET DEFAULT timezone('Asia/Bangkok', now()),
ALTER COLUMN "updatedAt" SET DEFAULT timezone('Asia/Bangkok', now());

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "createdAt" SET DEFAULT timezone('Asia/Bangkok', now()),
ALTER COLUMN "updatedAt" SET DEFAULT timezone('Asia/Bangkok', now());
