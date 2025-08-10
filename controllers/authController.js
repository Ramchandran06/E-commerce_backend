const pool = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const sendEmail = require("../utils/emailService");
const path = require("path");

exports.signup = async (req, res) => {
  const { fullName, email, password, mobile } = req.body;
  if (!fullName || !email || !password) {
    return res
      .status(400)
      .json({ message: "Full name, email, and password are required." });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 12);

    const query = `
      INSERT INTO Users (FullName, Email, Mobile, PasswordHash) 
      VALUES ($1, $2, $3, $4)
    `;
    const values = [fullName, email, mobile, hashedPassword];

    await pool.query(query, values);

    try {
      await sendEmail({
        to: email,
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
    if (error.code === "23505") {
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
    const result = await pool.query("SELECT * FROM Users WHERE Email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const isPasswordCorrect = await bcrypt.compare(password, user.passwordhash);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const payload = {
      userId: user.userid,
      Role: user.role,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    const {
      passwordhash,
      passwordresettoken,
      passwordresetexpires,
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
  if (!req.user || !req.user.userId) {
    return res
      .status(401)
      .json({ message: "Authentication error, user not found." });
  }

  const userId = req.user.userId;
  const { fullName, mobile } = req.body;

  if (!fullName && !mobile) {
    return res.status(400).json({ message: "No data provided to update." });
  }

  try {
    await pool.query(
      "UPDATE Users SET FullName = $1, Mobile = $2 WHERE UserID = $3",
      [fullName, mobile, userId]
    );

    const result = await pool.query("SELECT * FROM Users WHERE UserID = $1", [
      userId,
    ]);
    const { passwordhash, ...updatedUser } = result.rows[0];

    res.status(200).json({
      message: "Profile details updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Profile Update Error:", error);
    res
      .status(500)
      .json({ message: "An error occurred while updating the profile." });
  }
};

exports.updateProfilePicture = async (req, res) => {
  if (!req.user || !req.user.userId) {
    return res
      .status(401)
      .json({ message: "Authentication error, user not found." });
  }
  if (!req.file) {
    return res.status(400).json({ message: "No image file was received." });
  }

  const userId = req.user.userId;
  const profilePictureUrl = req.file.path;

  try {
    await pool.query(
      "UPDATE Users SET ProfilePictureURL = $1 WHERE UserID = $2",
      [profilePictureUrl, userId]
    );

    const result = await pool.query("SELECT * FROM Users WHERE UserID = $1", [
      userId,
    ]);
    const { passwordhash, ...updatedUser } = result.rows[0];

    res.status(200).json({
      message: "Profile picture updated successfully!",
      user: updatedUser,
    });
  } catch (error) {
    console.error("DATABASE/SQL ERROR in updateProfilePicture ", error);
    res.status(500).json({ message: "A server error occurred." });
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

  try {
    const result = await pool.query(
      "SELECT PasswordHash FROM Users WHERE UserID = $1",
      [userId]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    const isPasswordCorrect = await bcrypt.compare(
      oldPassword,
      user.passwordhash
    );
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Incorrect old password." });
    }

    const hashedNewPassword = await bcrypt.hash(newPassword, 12);

    await pool.query("UPDATE Users SET PasswordHash = $1 WHERE UserID = $2", [
      hashedNewPassword,
      userId,
    ]);

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
  console.log(`--- FORGOT PASSWORD START for email: ${email} ---`);
  try {
    const result = await pool.query(
      "SELECT * FROM Users WHERE LOWER(Email) = LOWER($1)",
      [email]
    );
    const user = result.rows[0];

    if (!user) {
      console.log("User not found in DB. Sending generic response.");
      return res.status(200).json({
        message:
          "If an account with that email exists, a password reset link has been sent.",
      });
    }
    console.log(`User found: ${user.fullname} (ID: ${user.userid})`);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    console.log("Generated reset token. Updating database...");

    await pool.query(
      "UPDATE Users SET PasswordResetToken = $1, PasswordResetExpires = $2 WHERE UserID = $3",
      [hashedToken, expires, user.userid]
    );
    console.log("Database updated successfully. Preparing to send email...");

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `You are receiving this email because you (or someone else) have requested the reset of a password. Please click on the following link, or paste this into your browser to complete the process:\n\n${resetURL}\n\nThis link is valid for 15 minutes.\nIf you did not request this, please ignore this email.`;

    await sendEmail({
      to: user.email,
      subject: "Password Reset Request",
      message,
    });

    console.log(`Email sent successfully to ${user.email}.`);

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

    const query = `
        SELECT * FROM Users 
        WHERE PasswordResetToken = $1 AND PasswordResetExpires > NOW()
    `;
    const result = await pool.query(query, [hashedToken]);
    const user = result.rows[0];

    if (!user) {
      return res
        .status(400)
        .json({ message: "Token is invalid or has expired." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await pool.query(
      "UPDATE Users SET PasswordHash = $1, PasswordResetToken = NULL, PasswordResetExpires = NULL WHERE UserID = $2",
      [hashedPassword, user.userid]
    );

    res.status(200).json({ message: "Password has been reset successfully!" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ message: "Error resetting password." });
  }
};
