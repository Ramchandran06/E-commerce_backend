const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../config/cloudinaryConfig");

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.put("/profile", authMiddleware, authController.updateUserProfile);
router.put("/change-password", authMiddleware, authController.changePassword);
router.post("/forgot-password", authController.forgotPassword);
router.put("/reset-password/:token", authController.resetPassword);

const debugMulter = (req, res, next) => {
  console.log("--- Multer Debug Middleware ---");
  console.log("Is req.file present?", !!req.file);
  if (req.file) {
    console.log("req.file details:", req.file);
  } else {
    console.log("req.file is MISSING.");
  }
  
  if (req.multerError) {
    console.error("Multer Error Object:", req.multerError);
  }
  next();
};

router.put(
  "/profile/picture",
  authMiddleware,
  (req, res, next) => {
    const uploader = upload.single("profilePicture");
    uploader(req, res, function (err) {
      if (err) {
        req.multerError = err;
      }
      next();
    });
  },

  debugMulter,

  authController.updateProfilePicture
);

module.exports = router;
