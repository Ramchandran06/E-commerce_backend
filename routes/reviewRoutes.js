const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const authMiddleware = require("../middleware/authMiddleware");

router.get("/featured", reviewController.getFeaturedReviews);
// GET /api/reviews/:productId
router.get("/:productId", reviewController.getProductReviews);

// POST /api/reviews/:productId
router.post("/:productId", authMiddleware, reviewController.addReview);

module.exports = router;
