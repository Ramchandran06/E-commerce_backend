const express = require("express");
const router = express.Router();
const wishlistController = require("../controllers/wishlistController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

router.get("/", wishlistController.getWishlist);
router.post("/toggle", wishlistController.toggleWishlistItem);

module.exports = router;
