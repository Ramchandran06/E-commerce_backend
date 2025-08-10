const pool = require("../db");

/**
 * Helper function to get cart items for a user.
 * @param {number} userId
 * @returns {Promise<Array>}
 */
const getCartItemsByUserId = async (userId) => {
  const query = `
        SELECT 
            ci.productid, 
            ci.quantity, 
            p.name,
            p.price,
            p.discountpercentage,
            p.thumbnail,
            p.stock
        FROM Carts c
        JOIN CartItems ci ON c.cartid = ci.cartid
        JOIN Products p ON ci.productid = p.productid
        WHERE c.userid = $1
    `;
 
  const result = await pool.query(query, [userId]);
  return result.rows;
};


exports.getCart = async (req, res) => {
  const userId = req.user.userId;
  try {
    const cartItems = await getCartItemsByUserId(userId);
    res.status(200).json(cartItems);
  } catch (error) {
    console.error("Get Cart Error:", error);
    res.status(500).json({ message: "Error fetching cart from database." });
  }
};


exports.addToCart = async (req, res) => {
  const userId = req.user.userId;
  const { productId, quantity } = req.body;

  if (!productId || !quantity || quantity < 1) {
    return res
      .status(400)
      .json({ message: "Product ID and a valid quantity are required." });
  }

  try {
   
    let cartResult = await pool.query(
      "SELECT cartid FROM Carts WHERE userid = $1",
      [userId]
    );
    let cartId;

    if (cartResult.rows.length > 0) {
      cartId = cartResult.rows[0].cartid;
    } else {
      let newCartResult = await pool.query(
        "INSERT INTO Carts (userid) VALUES ($1) RETURNING cartid",
        [userId]
      );
      cartId = newCartResult.rows[0].cartid;
    }

  
    let cartItemResult = await pool.query(
      "SELECT * FROM CartItems WHERE cartid = $1 AND productid = $2",
      [cartId, productId]
    );

    if (cartItemResult.rows.length > 0) {
     
      await pool.query(
        "UPDATE CartItems SET quantity = quantity + $1 WHERE cartid = $2 AND productid = $3",
        [quantity, cartId, productId]
      );
    } else {
      
      await pool.query(
        "INSERT INTO CartItems (cartid, productid, quantity) VALUES ($1, $2, $3)",
        [cartId, productId, quantity]
      );
    }
    

    const newCartItems = await getCartItemsByUserId(userId);
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

    const query = `
        DELETE FROM CartItems
        WHERE cartitemid IN (
            SELECT ci.cartitemid FROM CartItems ci
            JOIN Carts c ON ci.cartid = c.cartid
            WHERE c.userid = $1 AND ci.productid = $2
        )
    `;
    await pool.query(query, [userId, productId]);

    const newCartItems = await getCartItemsByUserId(userId);
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
   
    const query = `
        UPDATE CartItems
        SET quantity = $1
        WHERE cartitemid IN (
            SELECT ci.cartitemid FROM CartItems ci
            JOIN Carts c ON ci.cartid = c.cartid
            WHERE c.userid = $2 AND ci.productid = $3
        )
    `;
    await pool.query(query, [quantity, userId, productId]);

    const newCartItems = await getCartItemsByUserId(userId);
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
    const query = `
        DELETE FROM CartItems
        WHERE cartitemid IN (
            SELECT ci.cartitemid FROM CartItems ci
            JOIN Carts c ON ci.cartid = c.cartid
            WHERE c.userid = $1
        )
    `;
    await pool.query(query, [userId]);
    res.status(200).json({ message: "Cart cleared successfully.", cart: [] });
  } catch (error) {
    console.error("Clear Cart Error:", error);
    res.status(500).json({ message: "Error clearing cart." });
  }
};
