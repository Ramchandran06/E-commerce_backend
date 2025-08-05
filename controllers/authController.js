const sql = require("mssql");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const dbConfig = require("../dbConfig");
const crypto = require("crypto");
const sendEmail = require("../utils/emailService");

exports.signup = async (req, res) => {
  const { fullName, email, password, mobile } = req.body;
  if (!fullName || !email || !password) {
    return res
      .status(400)
      .json({ message: "Full name, email, and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("FullName", sql.NVarChar, fullName)
      .input("Email", sql.NVarChar, email)
      .input("Mobile", sql.NVarChar, mobile)
      .input("PasswordHash", sql.NVarChar, hashedPassword)
      .query(
        "INSERT INTO Users (FullName, Email, Mobile, PasswordHash) VALUES (@FullName, @Email, @Mobile, @PasswordHash)"
      );

    try {
      await sendEmail({
        to: to,
        subject: "Welcome to SIT Dress Shop!",
        message: `Hi ${fullName},\n\nThank you for creating an account with SIT Dress Shop. We're excited to have you join our community!\n\nHappy Shopping!\n\nThe SIT Dress Shop Team`,
        html: `<p>Hi <strong>${fullName}</strong>,</p><p>Thank you for creating an account with SIT Dress Shop. We're excited to have you join our community!</p><p>Happy Shopping!</p><p><strong>The SIT Dress Shop Team</strong></p>`,
      });
    } catch (emailError) {
      console.error(
        "User registration successful, but failed to send welcome email:",
        emailError
      );
    }

    res.status(201).json({ message: "User registered successfully!" });
  } catch (error) {
    console.error("Signup Error:", error);
    if (error.number === 2627) {
      // Unique key violation
      return res
        .status(409)
        .json({ message: "An account with this email already exists." });
    }
    res
      .status(500)
      .json({ message: "Database error during user registration." });
  }
};

exports.login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ message: "Please provide email and password." });
  }

  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT * FROM Users WHERE Email = @Email");

    const user = result.recordset[0];
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.PasswordHash);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const payload = {
      userId: user.UserID,
      Role: user.Role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const {
      PasswordHash,
      PasswordResetToken,
      PasswordResetExpires,
      ...userToReturn
    } = user;

    res.status(200).json({
      message: "Login successful!",
      token: token,
      user: userToReturn,
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ message: "An error occurred during login." });
  }
};

exports.updateUserProfile = async (req, res) => {
  const userId = req.user.userId;
  const { fullName, mobile } = req.body;

  if (!fullName && !mobile) {
    return res.status(400).json({ message: "No data provided to update." });
  }

  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("FullName", sql.NVarChar, fullName)
      .input("Mobile", sql.NVarChar, mobile)
      .query(
        "UPDATE Users SET FullName = @FullName, Mobile = @Mobile WHERE UserID = @UserID"
      );

    let result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query(
        "SELECT UserID, FullName, Email, Mobile, CreatedAt FROM Users WHERE UserID = @UserID"
      );

    const updatedUser = result.recordset[0];

    res.status(200).json({
      message: "Profile updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res
      .status(500)
      .json({ message: "An error occurred while updating the profile." });
  }
};
exports.changePassword = async (req, res) => {
  const userId = req.user.userId;
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    return res
      .status(400)
      .json({ message: "Old and new passwords are required." });
  }

  if (newPassword.length < 6) {
    return res
      .status(400)
      .json({ message: "Password must be at least 6 characters." });
  }

  try {
    let pool = await sql.connect(dbConfig);

    let result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT PasswordHash FROM Users WHERE UserID = @UserID");

    const user = result.recordset[0];
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    const isPasswordCorrect = await bcrypt.compare(
      oldPassword,
      user.PasswordHash
    );
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Incorrect old password." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("NewPasswordHash", sql.NVarChar, hashedNewPassword)
      .query(
        "UPDATE Users SET PasswordHash = @NewPasswordHash WHERE UserID = @UserID"
      );

    res.status(200).json({ message: "Password updated successfully!" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res
      .status(500)
      .json({ message: "An error occurred while changing the password." });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  try {
    const pool = await sql.connect(dbConfig);
    const result = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .query("SELECT * FROM Users WHERE Email = @Email");
    const user = result.recordset[0];

    if (!user) {
      return res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    await pool
      .request()
      .input("UserID", sql.Int, user.UserID)
      .input("Token", sql.NVarChar, hashedToken)
      .input("Expires", sql.DateTime, expires)
      .query(
        "UPDATE Users SET PasswordResetToken = @Token, PasswordResetExpires = @Expires WHERE UserID = @UserID"
      );

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please click on the following link, or paste this into your browser to complete the process:\n\n${resetURL}\n\nThis link is valid for 15 minutes.\nIf you did not request this, please ignore this email.`;

    await sendEmail({
      to: user.Email,
      subject: "Password Reset Request",
      message,
    });

    res.status(200).json({
      message:
        "If an account with that email exists, a password reset link has been sent.",
    });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ message: "An error occurred." });
  }
};

exports.resetPassword = async (req, res) => {
  const resetToken = req.params.token;
  const { newPassword } = req.body;

  if (!resetToken || !newPassword) {
    return res
      .status(400)
      .json({ message: "Token and new password are required." });
  }

  try {
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    const pool = await sql.connect(dbConfig);

    const query = `
        SELECT * FROM Users 
        WHERE PasswordResetToken = @Token AND PasswordResetExpires > GETUTCDATE()
    `;
    const result = await pool
      .request()
      .input("Token", sql.NVarChar, hashedToken)
      .query(query);
    const user = result.recordset[0];

    if (!user) {
      return res
        .status(400)
        .json({ message: "Token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool
      .request()
      .input("UserID", sql.Int, user.UserID)
      .input("PasswordHash", sql.NVarChar, hashedPassword)
      .query(
        "UPDATE Users SET PasswordHash = @PasswordHash, PasswordResetToken = NULL, PasswordResetExpires = NULL WHERE UserID = @UserID"
      );

    res.status(200).json({ message: "Password has been reset successfully!" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Error resetting password." });
  }
};

exports.updateProfilePicture = async (req, res) => {
  console.log("[START] updateProfilePicture controller hit");
  const userId = req.user.userId;

  console.log("Checking for req.file object...");
  if (!req.file) {
    console.error(
      " MULTER ERROR: req.file is undefined. Check middleware and field name."
    );
    return res
      .status(400)
      .json({ message: "No image file was received by the server." });
  }

  console.log("[SUCCESS] req.file object found:", req.file);

  try {
    const profilePictureUrl = req.file.path;
    console.log(`Step 1: Cloudinary URL received: ${profilePictureUrl}`);

    console.log(
      "Step 2: Connecting to database to update user profile picture..."
    );
    const pool = await sql.connect(dbConfig);

    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProfilePictureURL", sql.NVarChar, profilePictureUrl)
      .query(
        "UPDATE Users SET ProfilePictureURL = @ProfilePictureURL WHERE UserID = @UserID"
      );
    console.log(`Step 3: Database updated for UserID: ${userId}`);

    const result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT * FROM Users WHERE UserID = @UserID");
    const { PasswordHash, ...updatedUser } = result.recordset[0];

    console.log(" [END] updateProfilePicture successful ");
    res.status(200).json({
      message: "Profile picture updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("DATABASE/SQL ERROR in updateProfilePicture ", error);
    res.status(500).json({
      message: "A server error occurred while updating the profile picture.",
    });
  }
};
