const pool = require("../db"); // PostgreSQL இணைப்பு

/**
 * Helper function to get wishlist items for a user.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
const getWishlistItemsByUserId = async (userId) => {
  const query = `
        SELECT p.* FROM Wishlists w
        JOIN WishlistItems wi ON w.wishlistid = wi.wishlistid
        JOIN Products p ON wi.productid = p.productid
        WHERE w.userid = $1 ORDER BY wi.addedat DESC;
    `;
  const result = await pool.query(query, [userId]);
  return result.rows;
};

exports.getWishlist = async (req, res) => {
  const userId = req.user.userId;
  try {
    const wishlistItems = await getWishlistItemsByUserId(userId);
    res.status(200).json(wishlistItems);
  } catch (error) {
    console.error("Error fetching wishlist:", error);
    res.status(500).json({ message: "Error fetching wishlist." });
  }
};

exports.toggleWishlistItem = async (req, res) => {
  const userId = req.user.userId;
  const { productId } = req.body;

  if (!productId || typeof productId !== "number") {
    return res.status(400).json({ message: "A valid Product ID is required." });
  }

  try {
    let wishlistResult = await pool.query(
      "SELECT wishlistid FROM Wishlists WHERE userid = $1",
      [userId]
    );
    let wishlistId;

    if (wishlistResult.rows.length > 0) {
      wishlistId = wishlistResult.rows[0].wishlistid;
    } else {
      let newWishlistResult = await pool.query(
        "INSERT INTO Wishlists (userid) VALUES ($1) RETURNING wishlistid",
        [userId]
      );
      wishlistId = newWishlistResult.rows[0].wishlistid;
    }

    let wishlistItemResult = await pool.query(
      "SELECT * FROM WishlistItems WHERE wishlistid = $1 AND productid = $2",
      [wishlistId, productId]
    );

    let message;
    if (wishlistItemResult.rows.length > 0) {
      await pool.query(
        "DELETE FROM WishlistItems WHERE wishlistid = $1 AND productid = $2",
        [wishlistId, productId]
      );
      message = "Item removed from wishlist.";
    } else {
      await pool.query(
        "INSERT INTO WishlistItems (wishlistid, productid) VALUES ($1, $2)",
        [wishlistId, productId]
      );
      message = "Item added to wishlist.";
    }

    const newWishlistItems = await getWishlistItemsByUserId(userId);

    res.status(200).json({
      message: message,
      wishlist: newWishlistItems,
    });
  } catch (error) {
    console.error("Error toggling wishlist item:", error);
    res
      .status(500)
      .json({ message: "Error updating wishlist due to a server issue." });
  }
};
