const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.get(
  "/stats",
  authMiddleware,
  adminMiddleware,
  dashboardController.getDashboardStats
);
module.exports = router;
