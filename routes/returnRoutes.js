const express = require("express");
const router = express.Router();
const returnController = require("../controllers/returnController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

// POST /api/returns/request
router.post("/request", authMiddleware, returnController.requestReturn);

// GET /api/returns/admin/all
router.get(
  "/admin/all",
  authMiddleware,
  adminMiddleware,
  returnController.getAllReturns
);

// PUT /api/returns/admin/:returnId/status
router.put(
  "/admin/:returnId/status",
  authMiddleware,
  adminMiddleware,
  returnController.updateReturnStatus
);

module.exports = router;
