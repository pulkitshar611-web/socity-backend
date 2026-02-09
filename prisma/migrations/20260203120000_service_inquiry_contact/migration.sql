-- AlterTable: Add contact tracking and activity log to ServiceInquiry (Vendor CONTACT button)
ALTER TABLE `serviceinquiry` ADD COLUMN `contactedAt` DATETIME(3) NULL;
ALTER TABLE `serviceinquiry` ADD COLUMN `contactedBy` INT NULL;
ALTER TABLE `serviceinquiry` ADD COLUMN `activityLog` JSON NULL;
