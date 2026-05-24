-- AlterTable
ALTER TABLE "User" ADD COLUMN "wechatBoundAt" DATETIME;
ALTER TABLE "User" ADD COLUMN "wechatOpenId" TEXT;

-- CreateTable
CREATE TABLE "WechatSubscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "quota" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WechatSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");

-- CreateIndex
CREATE UNIQUE INDEX "WechatSubscription_userId_templateId_key" ON "WechatSubscription"("userId", "templateId");
