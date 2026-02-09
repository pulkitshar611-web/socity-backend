-- AlterTable: Add payment fields to ServiceInquiry (lead payment after CONFIRMED)
ALTER TABLE `serviceinquiry` ADD COLUMN `paymentStatus` VARCHAR(191) NULL DEFAULT 'PENDING';
ALTER TABLE `serviceinquiry` ADD COLUMN `payableAmount` DOUBLE NULL;
ALTER TABLE `serviceinquiry` ADD COLUMN `paymentMethod` VARCHAR(191) NULL;
ALTER TABLE `serviceinquiry` ADD COLUMN `transactionId` VARCHAR(191) NULL;
ALTER TABLE `serviceinquiry` ADD COLUMN `paymentDate` DATETIME(3) NULL;
