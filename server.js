require("dotenv").config();
const express = require("express");
const cors = require("cors");
const productRoutes = require("./routes/productRoutes");
const authRoutes = require("./routes/authRoutes");
const cartRoutes = require("./routes/cartRoutes");
const addressRoutes = require("./routes/addressRoutes");
const orderRoutes = require("./routes/orderRoutes");
const wishlistRoutes = require("./routes/wishlistRoutes");
const contactRoutes = require("./routes/contactRoutes");
const faqRoutes = require("./routes/faqRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const returnRoutes = require("./routes/returnRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const path = require("path");



const app = express();
const port = process.env.API_PORT || 5000;

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  methods: "GET,POST,PUT,DELETE,PATCH,HEAD",
  credentials: true,
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

app.use((req, res, next) => {
  console.log(
    `[LOGGER] Request received for: ${req.method} ${req.originalUrl}`
  );
  next();
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// API Routes
app.use("/api/products", productRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/wishlist", wishlistRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/faq", faqRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/returns", returnRoutes);
app.use("/api/dashboard", dashboardRoutes);

app.listen(port, () => {
  console.log(`API server is running on port ${port}`);
});
