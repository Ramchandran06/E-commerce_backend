const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.Role === "admin") {
    next();
  } else {
    res.status(403).json({ message: "Forbidden: Admin access required." });
  }
};

module.exports = adminMiddleware;
