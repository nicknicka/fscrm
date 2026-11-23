-- CreateTable
CREATE TABLE "model_configs" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "apiKeyCipher" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "model_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_bindings" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "boundByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_bindings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feishu_message_logs" (
    "messageId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "followUpId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feishu_message_logs_pkey" PRIMARY KEY ("messageId")
);

-- CreateTable
CREATE TABLE "card_action_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operatorOpenId" TEXT NOT NULL,
    "operatorUserId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chat_bindings_chatId_key" ON "chat_bindings"("chatId");

-- CreateIndex
CREATE INDEX "card_action_logs_targetType_targetId_idx" ON "card_action_logs"("targetType", "targetId");

-- AddForeignKey
ALTER TABLE "chat_bindings" ADD CONSTRAINT "chat_bindings_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
