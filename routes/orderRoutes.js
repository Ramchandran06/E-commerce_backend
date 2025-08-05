const express = require("express");
const router = express.Router();
const orderController = require("../controllers/orderController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

console.log(" Loading Order Routes");
console.log(
  "Is orderController.createOrder a function?",
  typeof orderController.createOrder
);
console.log(
  "Available functions in orderController:",
  Object.keys(orderController)
);

router.post("/", authMiddleware, orderController.createOrder);

router.get("/", authMiddleware, orderController.getOrders);

router.post("/:orderId/cancel", authMiddleware, orderController.cancelOrder);

router.get(
  "/admin/all",
  authMiddleware,
  adminMiddleware,
  orderController.getAllOrdersWithDetails
);

// Admin:  (Dashboard Chart)
router.get(
  "/admin/sales-summary",
  authMiddleware,
  adminMiddleware,
  orderController.getSalesSummary
);

// Razorpay Routes
router.post(
  "/razorpay/create-order",
  authMiddleware,
  orderController.createRazorpayOrder
);
router.post(
  "/razorpay/verify-payment",
  authMiddleware,
  orderController.verifyPaymentAndCreateOrder
);

// PUT /api/orders/admin/:orderId/status
router.put(
  '/admin/:orderId/status',
  authMiddleware,
  adminMiddleware,
  orderController.updateOrderStatus
);

module.exports = router;
