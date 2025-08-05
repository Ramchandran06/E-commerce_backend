const sql = require("mssql");
const dbConfig = require("../dbConfig");

exports.getProductReviews = async (req, res) => {
  const { productId } = req.params;
  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      SELECT r.ReviewID, r.Rating, r.Comment, r.CreatedAt, u.FullName
      FROM ProductReviews r
      JOIN Users u ON r.UserID = u.UserID
      WHERE r.ProductID = @ProductID
      ORDER BY r.CreatedAt DESC;
    `;
    const result = await pool
      .request()
      .input("ProductID", sql.Int, productId)
      .query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch reviews." });
  }
};

exports.addReview = async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.userId;

  if (!rating) return res.status(400).json({ message: "Rating is required." });

  try {
    const pool = await sql.connect(dbConfig);

    const orderCheckQuery = `
        SELECT TOP 1 o.OrderID FROM Orders o
        JOIN OrderItems oi ON o.OrderID = oi.OrderID
        WHERE o.UserID = @UserID AND oi.ProductID = @ProductID AND o.OrderStatus = 'Delivered';
    `;
    const orderResult = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .query(orderCheckQuery);

    if (orderResult.recordset.length === 0) {
      return res.status(403).json({
        message:
          "You can only review products you have purchased and received.",
      });
    }

    const existingReviewQuery = `SELECT ReviewID FROM ProductReviews WHERE UserID = @UserID AND ProductID = @ProductID`;
    const existingReviewResult = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .query(existingReviewQuery);
    if (existingReviewResult.recordset.length > 0) {
      return res
        .status(409)
        .json({ message: "You have already reviewed this product." });
    }

    const insertQuery = `
      INSERT INTO ProductReviews (ProductID, UserID, Rating, Comment)
      VALUES (@ProductID, @UserID, @Rating, @Comment);
    `;
    await pool
      .request()
      .input("ProductID", sql.Int, productId)
      .input("UserID", sql.Int, userId)
      .input("Rating", sql.Int, rating)
      .input("Comment", sql.NVarChar, comment)
      .query(insertQuery);

    res.status(201).json({ message: "Thank you for your review!" });
  } catch (error) {
    res.status(500).json({ message: "Failed to submit your review." });
  }
};

exports.getFeaturedReviews = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      SELECT TOP 5 
        pr.ReviewID, 
        pr.Rating, 
        pr.Comment, 
        u.FullName, 
        u.ProfilePictureURL,
        p.Name as ProductName
      FROM 
        ProductReviews AS pr
      JOIN 
        Users AS u ON pr.UserID = u.UserID
      JOIN 
        Products AS p ON pr.ProductID = p.ProductID
      WHERE 
        pr.IsFeatured = 1
      ORDER BY 
        pr.CreatedAt DESC;
    `;

    const result = await pool.request().query(query);

    console.log("Featured Reviews API Response:", result.recordset);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("!!! FATAL ERROR in getFeaturedReviews !!!:", error);
    res.status(500).json({
      message: "Failed to fetch featured reviews due to a server error.",
    });
  }
};

exports.addReview = async (req, res) => {
  const { productId } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.userId;

  if (!rating || rating < 1 || rating > 5) {
    return res
      .status(400)
      .json({ message: "A valid rating between 1 and 5 is required." });
  }

  const pool = await sql.connect(dbConfig);
  const transaction = new sql.Transaction(pool);

  try {
    await transaction.begin();

    const orderCheckQuery = `
        SELECT TOP 1 o.OrderID 
        FROM Orders o
        JOIN OrderItems oi ON o.OrderID = oi.OrderID
        WHERE o.UserID = @UserID 
          AND oi.ProductID = @ProductID 
          AND o.OrderStatus = 'Delivered';
    `;
    const orderResult = await new sql.Request(transaction)
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .query(orderCheckQuery);

    if (orderResult.recordset.length === 0) {
      await transaction.rollback();
      return res.status(403).json({
        message:
          "You can only review products you have purchased and received.",
      });
    }

    const existingReviewQuery = `SELECT ReviewID FROM ProductReviews WHERE UserID = @UserID AND ProductID = @ProductID`;
    const existingReviewResult = await new sql.Request(transaction)
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .query(existingReviewQuery);

    if (existingReviewResult.recordset.length > 0) {
      await transaction.rollback();
      return res.status(409).json({
        message: "You have already submitted a review for this product.",
      });
    }

    await new sql.Request(transaction)
      .input("ProductID", sql.Int, productId)
      .input("UserID", sql.Int, userId)
      .input("Rating", sql.Int, rating)
      .input("Comment", sql.NVarChar, comment || null)
      .query(
        `INSERT INTO ProductReviews (ProductID, UserID, Rating, Comment) VALUES (@ProductID, @UserID, @Rating, @Comment)`
      );

    const avgRatingQuery = `
      SELECT AVG(CAST(Rating AS FLOAT)) as newAvgRating 
      FROM ProductReviews 
      WHERE ProductID = @ProductID
    `;
    const avgResult = await new sql.Request(transaction)
      .input("ProductID", sql.Int, productId)
      .query(avgRatingQuery);
    const newAvgRating = avgResult.recordset[0].newAvgRating;

    await new sql.Request(transaction)
      .input("ProductID", sql.Int, productId)
      .input("NewRating", sql.Decimal(2, 1), newAvgRating)
      .query(
        "UPDATE Products SET Rating = @NewRating WHERE ProductID = @ProductID"
      );

    await transaction.commit();

    res.status(201).json({
      message: "Thank you for your review! It has been submitted successfully.",
    });
  } catch (error) {
    if (transaction.active) {
      await transaction.rollback();
    }
    console.error("Add Review Transaction Error:", error);
    res
      .status(500)
      .json({ message: "Failed to submit your review due to a server error." });
  }
};
