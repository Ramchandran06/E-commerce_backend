const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");
const authMiddleware = require("../middleware/authMiddleware");
const adminMiddleware = require("../middleware/adminMiddleware");


router.get("/new-arrivals", productController.getNewArrivals);
router.get("/deal-of-the-day", productController.getDealOfTheDay);
router.get("/search", productController.searchProducts);
router.get("/categories/all", productController.getAllCategories);
router.get("/category/:categoryName", productController.getProductsByCategory);
router.get("/", productController.getAllProducts); 
router.get("/:id", productController.getProductById); 
router.get(
  "/admin/stats",
  authMiddleware,
  adminMiddleware,
  productController.getProductsStats
);


// POST /api/products
router.post(
  "/",
  authMiddleware,
  adminMiddleware,
  productController.createProduct
);

// PUT /api/products/:id
router.put(
  "/:id",
  authMiddleware,
  adminMiddleware,
  productController.updateProduct
);

// DELETE /api/products/:id
router.delete(
  "/:id",
  authMiddleware,
  adminMiddleware,
  productController.deleteProduct
);

module.exports = router;
