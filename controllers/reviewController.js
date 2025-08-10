const pool = require("../db");

exports.getProductReviews = async (req, res) => {
  const { productId } = req.params;
  try {
    const query = `
      SELECT r.reviewid, r.rating, r.comment, r.createdat, u.fullname
      FROM ProductReviews r
      JOIN Users u ON r.userid = u.userid
      WHERE r.productid = $1
      ORDER BY r.createdat DESC;
    `;
    const result = await pool.query(query, [productId]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Failed to fetch reviews." });
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const orderCheckQuery = `
      SELECT o.orderid 
      FROM Orders o
      JOIN OrderItems oi ON o.orderid = oi.orderid
      WHERE o.userid = $1 AND oi.productid = $2 AND LOWER(o.orderstatus) = 'delivered'
      LIMIT 1;
    `;
    const orderResult = await client.query(orderCheckQuery, [
      userId,
      productId,
    ]);

    if (orderResult.rows.length === 0) {
      throw new Error(
        "You can only review products you have purchased and received."
      );
    }

    const existingReviewQuery = `SELECT reviewid FROM ProductReviews WHERE userid = $1 AND productid = $2`;
    const existingReviewResult = await client.query(existingReviewQuery, [
      userId,
      productId,
    ]);

    if (existingReviewResult.rows.length > 0) {
      throw new Error("You have already submitted a review for this product.");
    }

    const isFeatured = rating === 5;
    const insertQuery = `
      INSERT INTO ProductReviews (ProductID, UserID, Rating, Comment, IsFeatured) 
      VALUES ($1, $2, $3, $4, $5)
    `;
    const insertValues = [
      productId,
      userId,
      rating,
      comment || null,
      isFeatured,
    ];
    await client.query(insertQuery, insertValues);

    const avgRatingQuery = `SELECT AVG(Rating) as newAvgRating FROM ProductReviews WHERE ProductID = $1`;
    const avgResult = await client.query(avgRatingQuery, [productId]);
    const newAvgRating = parseFloat(avgResult.rows[0].newavgrating).toFixed(2);
    await client.query("UPDATE Products SET Rating = $1 WHERE ProductID = $2", [
      newAvgRating,
      productId,
    ]);

    await client.query("COMMIT");

    res.status(201).json({
      message: "Thank you for your review! It has been submitted successfully.",
    });
  } catch (error) {
    await client.query("ROLLBACK");

    console.error("Add Review Transaction Error:", error);

    if (
      error.message.includes("You can only review") ||
      error.message.includes("You have already submitted")
    ) {
      return res.status(403).json({ message: error.message });
    }

    res
      .status(500)
      .json({ message: "Failed to submit your review due to a server error." });
  } finally {
    client.release();
  }
};

exports.getFeaturedReviews = async (req, res) => {
  try {
    const query = `
      SELECT 
        pr.reviewid, pr.rating, pr.comment, 
        u.fullname, u.profilepictureurl,
        p.name as productname
      FROM ProductReviews AS pr
      JOIN Users AS u ON pr.userid = u.userid
      JOIN Products AS p ON pr.productid = p.productid
      WHERE pr.isfeatured = true
      ORDER BY pr.createdat DESC
      LIMIT 5;
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error in getFeaturedReviews:", error);
    res.status(500).json({
      message: "Failed to fetch featured reviews due to a server error.",
    });
  }
};
