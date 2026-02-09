-- Staff: guard who created this helper – guard sees only own helpers
ALTER TABLE `staff` ADD COLUMN `createdByGuardId` INT NULL;
ALTER TABLE `staff` ADD CONSTRAINT `staff_createdByGuardId_fkey`
  FOREIGN KEY (`createdByGuardId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
