-- Manual migration: add directParticipantId to conversation for DIRECT chat.
-- Run this with: mysql -u root -p society_db < prisma/migrations/add_direct_participant_conversation.sql
-- Or execute in MySQL Workbench / your DB client.

-- 1. Add column
ALTER TABLE `conversation` ADD COLUMN `directParticipantId` INTEGER NULL;

-- 2. Add foreign key to user
ALTER TABLE `conversation` ADD CONSTRAINT `conversation_directParticipantId_fkey`
  FOREIGN KEY (`directParticipantId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Drop old unique (conversation_societyId_type_participantId_key)
ALTER TABLE `conversation` DROP INDEX `conversation_societyId_type_participantId_key`;

-- 4. Add new unique including directParticipantId
ALTER TABLE `conversation` ADD UNIQUE INDEX `conversation_societyId_type_participantId_directParticipantId_key`
  (`societyId`, `type`, `participantId`, `directParticipantId`);
