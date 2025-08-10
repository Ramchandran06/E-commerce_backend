const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");

router.use((req, res, next) => {
  console.log(`[PRODUCT ROUTER] Reached product router for path: ${req.path}`);
  next();
});

router.get("/new-arrivals", productController.getNewArrivals);
router.get("/deal-of-the-day", productController.getDealOfTheDay);
router.get("/search", productController.searchProducts);
router.get("/categories/all", productController.getAllCategories);

router.get("/category/:categoryName", productController.getProductsByCategory);
router.get("/:id", productController.getProductById);



router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  productController.createProduct
);
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  productController.updateProduct
);
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  productController.deleteProduct
);

router.get(
  "/admin/stats",
  authMiddleware,
  adminMiddleware,
  productController.getProductsStats
);

router.get("/", productController.getAllProducts);

module.exports = router;
