-- CreateTable
CREATE TABLE "Donation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "imageUrl" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "pickupDates" TEXT NOT NULL,
    "pickupTimes" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "interestsNumber" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Donation_pkey" PRIMARY KEY ("id")
);
