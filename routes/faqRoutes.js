const express = require("express");
const router = express.Router();
const faqController = require("../controllers/faqController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");


router.get("/", faqController.getAllFAQs);
//Admin Routes
router.get(
  "/admin/all",
  authMiddleware,
  adminMiddleware,
  faqController.getAllFAQsForAdmin
);
router.post("/", authMiddleware, adminMiddleware, faqController.createFAQ);
router.put("/:id", authMiddleware, adminMiddleware, faqController.updateFAQ);
router.delete("/:id", authMiddleware, adminMiddleware, faqController.deleteFAQ);

module.exports = router;
