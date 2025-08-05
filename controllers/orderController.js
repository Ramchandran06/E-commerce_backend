const sql = require("mssql");
const dbConfig = require("../dbConfig");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const sendEmail = require("../utils/emailService");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const _createOrderInDatabase = async (
  userId,
  addressId,
  paymentMethod,
  paymentStatus,
  transaction
) => {
  let cartResult = await new sql.Request(transaction)
    .input("UserID", sql.Int, userId)
    .query("SELECT CartID FROM Carts WHERE UserID = @UserID");
  const cartId = cartResult.recordset[0]?.CartID;
  if (!cartId) throw new Error("Your cart is empty or could not be found.");
  const cartItemsResult = await new sql.Request(transaction)
    .input("CartID", sql.Int, cartId)
    .query(
      `SELECT ci.ProductID, ci.Quantity, p.Price, p.Stock, p.Name FROM CartItems ci JOIN Products p ON ci.ProductID = p.ProductID WHERE ci.CartID = @CartID`
    );
  const cartItems = cartItemsResult.recordset;
  if (cartItems.length === 0) throw new Error("Your cart is empty.");
  for (const item of cartItems) {
    if (item.Quantity > item.Stock)
      throw new Error(`Not enough stock for ${item.Name}.`);
  }
  const totalPrice = cartItems.reduce(
    (total, item) => total + item.Quantity * item.Price,
    0
  );
  let orderResult = await new sql.Request(transaction)
    .input("UserID", sql.Int, userId)
    .input("AddressID", sql.Int, addressId)
    .input("TotalPrice", sql.Decimal(10, 2), totalPrice)
    .input("PaymentMethod", sql.NVarChar, paymentMethod)
    .input("PaymentStatus", sql.NVarChar, paymentStatus)
    .query(
      `INSERT INTO Orders (UserID, AddressID, TotalPrice, PaymentMethod, PaymentStatus) OUTPUT INSERTED.OrderID VALUES (@UserID, @AddressID, @TotalPrice, @PaymentMethod, @PaymentStatus)`
    );
  const newOrderId = orderResult.recordset[0].OrderID;
  for (const item of cartItems) {
    await new sql.Request(transaction)
      .input("OrderID", sql.Int, newOrderId)
      .input("ProductID", sql.Int, item.ProductID)
      .input("Quantity", sql.Int, item.Quantity)
      .input("PriceAtTimeOfOrder", sql.Decimal(10, 2), item.Price)
      .query(
        `INSERT INTO OrderItems (OrderID, ProductID, Quantity, PriceAtTimeOfOrder) VALUES (@OrderID, @ProductID, @Quantity, @PriceAtTimeOfOrder)`
      );
    await new sql.Request(transaction)
      .input("Quantity", sql.Int, item.Quantity)
      .input("ProductID", sql.Int, item.ProductID)
      .query(
        "UPDATE Products SET Stock = Stock - @Quantity WHERE ProductID = @ProductID"
      );
  }
  await new sql.Request(transaction)
    .input("CartID", sql.Int, cartId)
    .query("DELETE FROM CartItems WHERE CartID = @CartID");
  return { newOrderId, totalPrice, cartItems };
};

const sendOrderConfirmationEmail = async (user, orderId, totalPrice, items) => {
  if (!user || !user.Email) {
    console.error("Cannot send order confirmation: User email is missing.");
    return;
  }

  let itemsHtml = items
    .map(
      (item) =>
        `<tr>
      <td style="padding: 10px; border-bottom: 1px solid #ddd;">${
        item.Name || "Product"
      } (Qty: ${item.Quantity || 1})</td>
      <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">₹${(
        item.Price * item.Quantity
      ).toLocaleString("en-IN")}</td>
    </tr>`
    )
    .join("");

  const emailHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
      <h2 style="color: #8A2BE2;">Hi ${user.FullName || "Customer"},</h2>
      <p>Thank you for your order! We've received it and will start processing it shortly.</p>
      <h3>Order Summary (ID: #${orderId})</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <thead><tr>
          <th style="padding: 12px; border-bottom: 2px solid #8A2BE2; text-align: left;">Item</th>
          <th style="padding: 12px; border-bottom: 2px solid #8A2BE2; text-align: right;">Price</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
        <tfoot><tr>
          <td style="padding: 12px; font-weight: bold; text-align: right;">Total:</td>
          <td style="padding: 12px; font-weight: bold; text-align: right;">₹${totalPrice.toLocaleString(
            "en-IN"
          )}</td>
        </tr></tfoot>
      </table>
      <p style="margin-top: 20px;">You can view your order details in your account: <a href="${
        process.env.FRONTEND_URL
      }/my-orders" style="color: #8A2BE2;">My Orders</a></p>
      <p>Thanks for shopping with us!</p>
      <p><strong>The SIT Dress Shop Team</strong></p>
    </div>
  `;

  await sendEmail({
    to: user.Email,
    subject: `Your SIT Dress Shop Order Confirmation #${orderId}`,
    html: emailHtml,
  });
};

exports.createOrder = async (req, res) => {
  const userId = req.user.userId;
  const { addressId, paymentMethod } = req.body;
  if (paymentMethod !== "COD")
    return res.status(400).json({ message: "Invalid payment method." });

  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const userResult = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT FullName, Email FROM Users WHERE UserID = @UserID");
    const user = userResult.recordset[0];
    if (!user) return res.status(404).json({ message: "User not found." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const { newOrderId, totalPrice, cartItems } =
        await _createOrderInDatabase(
          userId,
          addressId,
          "COD",
          "Pending",
          transaction
        );
      await transaction.commit();

      try {
        await sendOrderConfirmationEmail(
          user,
          newOrderId,
          totalPrice,
          cartItems
        );
      } catch (emailError) {
        console.error(
          "COD order created, but failed to send email:",
          emailError
        );
      }

      res
        .status(201)
        .json({ message: "Order placed successfully!", orderId: newOrderId });
    } catch (err) {
      await transaction.rollback();
      res
        .status(500)
        .json({ message: err.message || "Failed to place order." });
    }
  } catch (error) {
    res.status(500).json({ message: "Database connection error." });
  }
};

exports.verifyPaymentAndCreateOrder = async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    addressId,
  } = req.body;
  const userId = req.user.userId;

  try {
    let pool = await sql.connect(dbConfig);
    const userResult = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT FullName, Email FROM Users WHERE UserID = @UserID");
    const user = userResult.recordset[0];
    if (!user) return res.status(404).json({ message: "User not found." });

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const { newOrderId, totalPrice, cartItems } =
        await _createOrderInDatabase(
          userId,
          addressId,
          "Online",
          "Paid",
          transaction
        );
       await new sql.Request(transaction)
         .input("OrderID", sql.Int, newOrderId)
         .input("PaymentID", sql.NVarChar, razorpay_payment_id) 
         .query(
           "UPDATE Orders SET RazorpayPaymentID = @PaymentID WHERE OrderID = @OrderID"
         );
      await transaction.commit();

      try {
        await sendOrderConfirmationEmail(
          user,
          newOrderId,
          totalPrice,
          cartItems
        );
      } catch (emailError) {
        console.error(
          "Online order created, but failed to send email:",
          emailError
        );
      }

      res.status(201).json({
        message: "Payment verified and order placed successfully!",
        orderId: newOrderId,
      });
    } catch (err) {
      await transaction.rollback();
      res.status(500).json({
        message: err.message || "Failed to save order after payment.",
      });
    }
  } catch (error) {
    res
      .status(500)
      .json({ message: "Server error during payment verification." });
  }
};

exports.getOrders = async (req, res) => {
  const userId = req.user.userId;
  try {
    let pool = await sql.connect(dbConfig);

    const query = `
      SELECT 
        o.OrderID, o.OrderDate, o.TotalPrice, o.OrderStatus,
        oi.OrderItemID, oi.Quantity, oi.PriceAtTimeOfOrder,
        p.ProductID, p.Name as ProductName, p.Thumbnail,
        ua.AddressID, ua.AddressLine1, ua.AddressLine2, ua.City, ua.State, ua.PostalCode
      FROM Orders o
      JOIN OrderItems oi ON o.OrderID = oi.OrderID
      JOIN Products p ON oi.ProductID = p.ProductID
      LEFT JOIN UserAddresses ua ON o.AddressID = ua.AddressID
      WHERE o.UserID = @UserID
      ORDER BY o.OrderDate DESC;
    `;
    const result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query(query);

    const ordersMap = new Map();
    result.recordset.forEach((row) => {
      if (!ordersMap.has(row.OrderID)) {
        ordersMap.set(row.OrderID, {
          OrderID: row.OrderID,
          OrderDate: row.OrderDate,
          TotalPrice: row.TotalPrice,
          OrderStatus: row.OrderStatus,
          ShippingAddress: row.AddressID
            ? {
                AddressID: row.AddressID,
                AddressLine1: row.AddressLine1,
                AddressLine2: row.AddressLine2,
                City: row.City,
                State: row.State,
                PostalCode: row.PostalCode,
              }
            : null,
          Items: [],
        });
      }
      ordersMap.get(row.OrderID).Items.push({
        OrderItemID: row.OrderItemID,
        ProductID: row.ProductID,
        ProductName: row.ProductName,
        Thumbnail: row.Thumbnail,
        Quantity: row.Quantity,
        Price: row.PriceAtTimeOfOrder,
      });
    });

    const orders = Array.from(ordersMap.values());
    res.status(200).json(orders);
  } catch (error) {
    console.error("Get User Orders Error:", error);
    res.status(500).json({ message: "Error fetching your orders." });
  }
};

exports.getAllOrdersWithDetails = async (req, res) => {
  console.log("Admin: Fetching all orders with details...");

  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  try {
    const pool = await sql.connect(dbConfig);

    const countResult = await pool
      .request()
      .query("SELECT COUNT(*) as total FROM Orders");
    const totalOrders = countResult.recordset[0].total;

   
    const ordersQuery = `
      SELECT o.OrderID, o.OrderDate, o.TotalPrice, o.OrderStatus, u.FullName as Username
      FROM Orders o JOIN Users u ON o.UserID = u.UserID
      ORDER BY o.OrderDate DESC
      OFFSET @Offset ROWS
      FETCH NEXT @Limit ROWS ONLY;
    `;
    const ordersResult = await pool
      .request()
      .input("Offset", sql.Int, offset)
      .input("Limit", sql.Int, limitNum)
      .query(ordersQuery);
    const orders = ordersResult.recordset;

   
    if (orders.length > 0) {
      for (const order of orders) {
        const itemsQuery = `
          SELECT oi.OrderItemID, oi.Quantity, oi.PriceAtTimeOfOrder, p.ProductID, p.Name, p.Thumbnail
          FROM OrderItems oi JOIN Products p ON oi.ProductID = p.ProductID
          WHERE oi.OrderID = @OrderID
        `;
        const itemsResult = await pool
          .request()
          .input("OrderID", sql.Int, order.OrderID)
          .query(itemsQuery);
        order.Items = itemsResult.recordset;
      }
    }

    console.log(
      `Successfully fetched ${orders.length} orders for page ${pageNum}.`
    );

    res.status(200).json({
      orders: orders,
      totalPages: Math.ceil(totalOrders / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
  
    console.error("!!! FATAL ERROR in getAllOrdersWithDetails !!!:", error);
    res
      .status(500)
      .json({ message: "Error fetching orders from the database." });
  }
};

exports.createRazorpayOrder = async (req, res) => {
  const { amount } = req.body;
  try {
    const options = {
      amount: amount,
      currency: "INR",
      receipt: `receipt_order_${new Date().getTime()}`,
    };
    const order = await razorpay.orders.create(options);
    res.status(200).json(order);
  } catch (error) {
    console.error("Error creating Razorpay order:", error);
    res.status(500).json({ message: "Error creating Razorpay order." });
  }
};

exports.getSalesSummary = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `
            SELECT 
                CAST(OrderDate AS DATE) as date,
                SUM(TotalPrice) as totalSales
            FROM Orders
            WHERE OrderStatus != 'Cancelled'
            GROUP BY CAST(OrderDate AS DATE)
            ORDER BY date ASC;
        `;
    const result = await pool.request().query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    res.status(500).json({ message: "Error fetching sales summary." });
  }
};

exports.cancelOrder = async (req, res) => {
  const userId = req.user.userId;
  const { orderId } = req.params;

  let pool;
  try {
    pool = await sql.connect(dbConfig);
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      let orderResult = await new sql.Request(transaction)
        .input("OrderID", sql.Int, orderId)
        .input("UserID", sql.Int, userId)
        .query(
          "SELECT OrderID, OrderStatus FROM Orders WHERE OrderID = @OrderID AND UserID = @UserID"
        );

      const order = orderResult.recordset[0];
      if (!order) {
        throw new Error(
          "Order not found or you do not have permission to cancel it."
        );
      }

      if (order.OrderStatus !== "Processing") {
        throw new Error(
          `Order cannot be cancelled as it is in '${order.OrderStatus}' state.`
        );
      }

      const orderItemsResult = await new sql.Request(transaction)
        .input("OrderID", sql.Int, orderId)
        .query(
          "SELECT ProductID, Quantity FROM OrderItems WHERE OrderID = @OrderID"
        );
      const orderItems = orderItemsResult.recordset;

      for (const item of orderItems) {
        await new sql.Request(transaction)
          .input("Quantity", sql.Int, item.Quantity)
          .input("ProductID", sql.Int, item.ProductID)
          .query(
            "UPDATE Products SET Stock = Stock + @Quantity WHERE ProductID = @ProductID"
          );
      }
      await new sql.Request(transaction)
        .input("OrderID", sql.Int, orderId)
        .query(
          "UPDATE Orders SET OrderStatus = 'Cancelled' WHERE OrderID = @OrderID"
        );

      await transaction.commit();
      res
        .status(200)
        .json({ message: "Order has been successfully cancelled." });
    } catch (err) {
      await transaction.rollback();
      res.status(400).json({ message: err.message });
    }
  } catch (error) {
    console.error("Cancel Order Error:", error);
    res.status(500).json({ message: "Failed to cancel the order." });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "New status is required." });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const orderResult = await pool
      .request()
      .input("OrderID", sql.Int, orderId)
      .query("SELECT * FROM Orders WHERE OrderID = @OrderID");

    if (orderResult.recordset.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    const order = orderResult.recordset[0];

    await pool
      .request()
      .input("OrderID", sql.Int, orderId)
      .input("OrderStatus", sql.NVarChar, status)
      .query(
        `UPDATE Orders SET OrderStatus = @OrderStatus WHERE OrderID = @OrderID`
      );

    if (status === "Shipped" || status === "Delivered") {
      const userResult = await pool
        .request()
        .input("UserID", sql.Int, order.UserID)
        .query("SELECT FullName, Email FROM Users WHERE UserID = @UserID");
      const user = userResult.recordset[0];

      await sendEmail({
        to: user.Email,
        subject: `Your Order #${orderId} has been ${status}!`,
        message: `Hi ${user.FullName},\n\nGood news! Your order #${orderId} has been updated to '${status}'.\n\nYou can view your order details here: ${process.env.FRONTEND_URL}/my-orders\n\nThanks for shopping with us!\nThe SIT Dress Shop Team`,
      });
    }

    res.status(200).json({ message: `Order status updated to ${status}.` });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Failed to update order status." });
  }
};
