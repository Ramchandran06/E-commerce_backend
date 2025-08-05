const sql = require("mssql");
const dbConfig = require("../dbConfig");

/**
  helper function.
 * @param {object} pool
 * @param {number} userId 
 * @returns {Promise<Array>} 
 */
const getCartItemsByUserId = async (pool, userId) => {
  const query = `
        SELECT 
            ci.ProductID, 
            ci.Quantity as qty, 
            p.Name,
            p.Price,
            p.DiscountPercentage,
            p.Thumbnail,
            p.Stock
        FROM Carts c
        JOIN CartItems ci ON c.CartID = ci.CartID
        JOIN Products p ON ci.ProductID = p.ProductID
        WHERE c.UserID = @UserID
    `;
  const result = await pool
    .request()
    .input("UserID", sql.Int, userId)
    .query(query);
  return result.recordset;
};

exports.getCart = async (req, res) => {
  const userId = req.user.userId;
  try {
    let pool = await sql.connect(dbConfig);
    const cartItems = await getCartItemsByUserId(pool, userId);
    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Get Cart Error:", error);
    res.status(500).json({ message: "Error fetching cart from database." });
  }
};

exports.addToCart = async (req, res) => {
  const userId = req.user.userId;
  const { productId, quantity } = req.body;

  if (!productId || !quantity) {
    return res
      .status(400)
      .json({ message: "Product ID and quantity are required." });
  }

  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .input("Quantity", sql.Int, quantity)
      .execute("usp_AddToCart");

    const newCartItems = await getCartItemsByUserId(pool, userId);
    res.status(200).json({
      message: "Item added to cart successfully!",
      cart: newCartItems,
    });
  } catch (error) {
    console.error("Add to Cart Error:", error);
    res.status(500).json({ message: "Error adding item to cart." });
  }
};

exports.removeFromCart = async (req, res) => {
  const userId = req.user.userId;
  const { productId } = req.params;
  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId).query(`
                DELETE ci FROM CartItems ci
                JOIN Carts c ON ci.CartID = c.CartID
                WHERE c.UserID = @UserID AND ci.ProductID = @ProductID
            `);

    const newCartItems = await getCartItemsByUserId(pool, userId);
    res
      .status(200)
      .json({ message: "Item removed from cart.", cart: newCartItems });
  } catch (error) {
    console.error("Remove From Cart Error:", error);
    res.status(500).json({ message: "Error removing item from cart." });
  }
};

exports.updateCartQuantity = async (req, res) => {
  const userId = req.user.userId;
  const { productId, quantity } = req.body;

  if (quantity < 1) {
    return exports.removeFromCart(
      { user: { userId }, params: { productId } },
      res
    );
  }

  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("ProductID", sql.Int, productId)
      .input("Quantity", sql.Int, quantity).query(`
                UPDATE ci SET Quantity = @Quantity
                FROM CartItems ci
                JOIN Carts c ON ci.CartID = c.CartID
                WHERE c.UserID = @UserID AND ci.ProductID = @ProductID
            `);

    const newCartItems = await getCartItemsByUserId(pool, userId);
    res
      .status(200)
      .json({ message: "Cart quantity updated.", cart: newCartItems });
  } catch (error) {
    console.error("Update Cart Quantity Error:", error);
    res.status(500).json({ message: "Error updating cart quantity." });
  }
};

exports.clearCart = async (req, res) => {
  const userId = req.user.userId;
  try {
    let pool = await sql.connect(dbConfig);
    await pool.request().input("UserID", sql.Int, userId).query(`
                DELETE ci FROM CartItems ci
                JOIN Carts c ON ci.CartID = c.CartID
                WHERE c.UserID = @UserID
            `);
    res.status(200).json({ message: "Cart cleared successfully.", cart: [] });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    res.status(500).json({ message: "Error clearing cart." });
  }
};
