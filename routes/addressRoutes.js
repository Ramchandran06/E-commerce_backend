const express = require("express");
const router = express.Router();
const addressController = require("../controllers/addressController");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// GET /api/addresses 
router.get("/", addressController.getUserAddresses);

// POST /api/addresses/add 
router.post("/add", addressController.addAddress);

router.put("/update/:addressId", addressController.updateAddress);
router.delete("/delete/:addressId", addressController.deleteAddress);

module.exports = router;
