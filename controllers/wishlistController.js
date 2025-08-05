const sql = require("mssql");
const dbConfig = require("../dbConfig");

const getWishlistItemsByUserId = async (pool, userId) => {
  const query = `
        SELECT p.* FROM Wishlists w
        JOIN WishlistItems wi ON w.WishlistID = wi.WishlistID
        JOIN Products p ON wi.ProductID = p.ProductID
        WHERE w.UserID = @UserID ORDER BY wi.AddedAt DESC;
    `;
  const result = await pool
    .request()
    .input("UserID", sql.Int, userId)
    .query(query);
  return result.recordset;
};

exports.getWishlist = async (req, res) => {
  const userId = req.user.userId;
  try {
    let pool = await sql.connect(dbConfig);
    const wishlistItems = await getWishlistItemsByUserId(pool, userId);
    res.status(200).json(wishlistItems);
  } catch (error) {
    res.status(500).json({ message: "Error fetching wishlist." });
  }
};

exports.toggleWishlistItem = async (req, res) => {
  if (!req.user || !req.user.userId) {
    return res
      .status(401)
      .json({ message: "Authentication error: User not found." });
  }

 
  console.log("RAW REQUEST BODY:", req.body);
  const productId = req.body.productId; 
 

  const userId = req.user.userId;

  if (!productId || typeof productId !== "number") {
    
    console.error(
      "CRITICAL ERROR: Invalid or missing productId. Received:",
      productId
    );
    return res.status(400).json({ message: "A valid Product ID is required." });
  }

  console.log(
    `Toggling wishlist for UserID: ${userId}, ProductID: ${productId}`
  );

  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .execute("usp_ToggleWishlistItem");

    const newWishlistItems = await getWishlistItemsByUserId(pool, userId);

    res.status(200).json({
      message: "Wishlist updated successfully.",
      wishlist: newWishlistItems,
    });
  } catch (error) {
    console.error("DATABASE/SQL ERROR in toggleWishlistItem:", error);
    res
      .status(500)
      .json({ message: "Error updating wishlist due to a server issue." });
  }
};
