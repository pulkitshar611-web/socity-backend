const express = require("express");
const router = express.Router();
const ServiceCategoryController = require("../controllers/ServiceCategory.controller");
const ServiceInquiryController = require("../controllers/ServiceInquiry.controller");
const {
  authenticate,
  authorize,
} = require("../middlewares/auth.middleware.js");

router.get(
  "/categories",
  authenticate,
  ServiceCategoryController.listCategories,
);
router.post(
  "/categories",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  ServiceCategoryController.createCategory,
);
router.put(
  "/categories/:id",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  ServiceCategoryController.updateCategory,
);
router.delete(
  "/categories/:id",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  ServiceCategoryController.deleteCategory,
);

router.get("/inquiries", authenticate, ServiceInquiryController.listInquiries);
router.post("/inquiries", authenticate, ServiceInquiryController.createInquiry);
router.get(
  "/inquiries/:id/payment-details",
  authenticate,
  ServiceInquiryController.getPaymentDetails,
);
router.post(
  "/inquiries/:id/initiate-payment",
  authenticate,
  ServiceInquiryController.initiatePayment,
);
router.patch(
  "/inquiries/:id/payment-status",
  authenticate,
  authorize(["ADMIN", "SUPER_ADMIN"]),
  ServiceInquiryController.updatePaymentStatus,
);
router.put(
  "/inquiries/:id/assign",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  ServiceInquiryController.assignVendor,
);
router.patch(
  "/inquiries/:id/assign",
  authenticate,
  authorize(["SUPER_ADMIN"]),
  ServiceInquiryController.assignVendor,
);
router.patch(
  "/inquiries/:id/contact",
  authenticate,
  ServiceInquiryController.markAsContacted,
);
router.patch(
  "/inquiries/:id/status",
  authenticate,
  ServiceInquiryController.updateStatus,
);

module.exports = router;
