-- Run this in MySQL (society_db) to add guard-scoped columns.
-- Use: mysql -u root -p society_db < run_guard_columns_manually.sql
-- Or paste in MySQL Workbench and execute.

-- Add checkedInById to visitor (guard who checked in)
ALTER TABLE `visitor` ADD COLUMN `checkedInById` INT NULL;
ALTER TABLE `visitor` ADD CONSTRAINT `visitor_checkedInById_fkey` 
  FOREIGN KEY (`checkedInById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add loggedByGuardId to parcel (guard who logged)
ALTER TABLE `parcel` ADD COLUMN `loggedByGuardId` INT NULL;
ALTER TABLE `parcel` ADD CONSTRAINT `parcel_loggedByGuardId_fkey` 
  FOREIGN KEY (`loggedByGuardId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Add createdByGuardId to staff (guard who created this helper)
ALTER TABLE `staff` ADD COLUMN `createdByGuardId` INT NULL;
ALTER TABLE `staff` ADD CONSTRAINT `staff_createdByGuardId_fkey`
  FOREIGN KEY (`createdByGuardId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
