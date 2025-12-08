-- CreateTable
CREATE TABLE "UserBuild" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "cancelledAt" TIMESTAMP(3),
    "baseDistro" TEXT NOT NULL,
    "spec" JSONB NOT NULL,
    "kernelVersion" TEXT,
    "initSystem" TEXT,
    "architecture" TEXT DEFAULT 'x86_64',
    "securityLevel" TEXT,
    "buildDuration" INTEGER,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "UserBuild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "buildId" TEXT NOT NULL,

    CONSTRAINT "BuildLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuildArtifact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" BIGINT,
    "checksum" TEXT,
    "buildId" TEXT NOT NULL,

    CONSTRAINT "BuildArtifact_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "BuildLog" ADD CONSTRAINT "BuildLog_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "UserBuild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuildArtifact" ADD CONSTRAINT "BuildArtifact_buildId_fkey" FOREIGN KEY ("buildId") REFERENCES "UserBuild"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
