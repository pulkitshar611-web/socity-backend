-- AlterTable Visitor: add checkedInById (guard who checked in)
ALTER TABLE `visitor` ADD COLUMN `checkedInById` INTEGER NULL;
ALTER TABLE `visitor` ADD CONSTRAINT `visitor_checkedInById_fkey` FOREIGN KEY (`checkedInById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable Parcel: add loggedByGuardId (guard who logged parcel)
ALTER TABLE `parcel` ADD COLUMN `loggedByGuardId` INTEGER NULL;
ALTER TABLE `parcel` ADD CONSTRAINT `parcel_loggedByGuardId_fkey` FOREIGN KEY (`loggedByGuardId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
