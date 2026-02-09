-- Add createdByUserId to society (Super Admin who created this society – chat allowed only with this society's admins)
ALTER TABLE `society` ADD COLUMN `createdByUserId` INT NULL;
ALTER TABLE `society` ADD CONSTRAINT `society_createdByUserId_fkey`
  FOREIGN KEY (`createdByUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
