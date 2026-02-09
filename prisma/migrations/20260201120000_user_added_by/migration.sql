-- Add addedByUserId to user (Individual can only chat with Super Admin + user who added them)
ALTER TABLE `user` ADD COLUMN `addedByUserId` INT NULL;
ALTER TABLE `user` ADD CONSTRAINT `user_addedByUserId_fkey`
  FOREIGN KEY (`addedByUserId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
