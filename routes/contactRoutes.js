const express = require("express");
const router = express.Router();
const contactController = require("../controllers/contactController");
const authMiddleware = require("../middleware/authMiddleware"); 
const adminMiddleware = require("../middleware/adminMiddleware");
// Public
router.post('/submit', contactController.submitContactForm);

// Admin: 
router.get('/', authMiddleware, adminMiddleware, contactController.getAllMessages);

// Admin: Read
router.put('/:messageId/read', authMiddleware, adminMiddleware, contactController.markMessageAsRead);

module.exports = router;
