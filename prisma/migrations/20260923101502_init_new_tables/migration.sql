-- AlterTable
ALTER TABLE "Role" ALTER COLUMN "createAt" SET DEFAULT timezone('Asia/Bangkok', now()),
ALTER COLUMN "updatedAt" SET DEFAULT timezone('Asia/Bangkok', now());

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "lineId" TEXT,
    "age" INTEGER,
    "roleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('Asia/Bangkok', now()),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('Asia/Bangkok', now()),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Emp" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "lineId" TEXT,
    "age" INTEGER,
    "roleId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('Asia/Bangkok', now()),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT timezone('Asia/Bangkok', now()),

    CONSTRAINT "Emp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Emp_email_key" ON "Emp"("email");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Emp" ADD CONSTRAINT "Emp_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
