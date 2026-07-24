-- CreateTable
CREATE TABLE "SpotifySettings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'spotify',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "fallbackContextUri" TEXT NOT NULL DEFAULT '',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "deviceName" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "connectedName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpotifySettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpotifySettings_key_key" ON "SpotifySettings"("key");
