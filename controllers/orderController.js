const pool = require("../db");
const Razorpay = require("razorpay");
const sendEmail = require("../utils/emailService");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});


const _createOrderInDatabase = async (
  client,
  userId,
  addressId,
  paymentMethod,
  paymentStatus
) => {
  let cartResult = await client.query(
    "SELECT cartid FROM Carts WHERE userid = $1",
    [userId]
  );
  const cartId = cartResult.rows[0]?.cartid;
  if (!cartId) throw new Error("Your cart is empty or could not be found.");

  const cartItemsResult = await client.query(
    `SELECT ci.productid, ci.quantity, p.price, p.stock, p.name FROM CartItems ci JOIN Products p ON ci.productid = p.productid WHERE ci.cartid = $1`,
    [cartId]
  );
  const cartItems = cartItemsResult.rows;
  if (cartItems.length === 0) throw new Error("Your cart is empty.");

  for (const item of cartItems) {
    if (item.quantity > item.stock)
      throw new Error(`Not enough stock for ${item.name}.`);
  }

  const totalPrice = cartItems.reduce(
    (total, item) => total + item.quantity * item.price,
    0
  );

  let orderResult = await client.query(
    `INSERT INTO Orders (UserID, AddressID, TotalPrice, PaymentMethod, PaymentStatus) VALUES ($1, $2, $3, $4, $5) RETURNING orderid`,
    [userId, addressId, totalPrice, paymentMethod, paymentStatus]
  );
  const newOrderId = orderResult.rows[0].orderid;

  for (const item of cartItems) {
    await client.query(
      `INSERT INTO OrderItems (OrderID, ProductID, Quantity, PriceAtTimeOfOrder) VALUES ($1, $2, $3, $4)`,
      [newOrderId, item.productid, item.quantity, item.price]
    );
    await client.query(
      "UPDATE Products SET Stock = Stock - $1 WHERE ProductID = $2",
      [item.quantity, item.productid]
    );
  }

  await client.query("DELETE FROM CartItems WHERE cartid = $1", [cartId]);

  return { newOrderId, totalPrice, cartItems };
};

const sendOrderConfirmationEmail = async (user, orderId, totalPrice, items) => {
  if (!user || !user.email) {
    console.error("Cannot send order confirmation: User email is missing.");
    return;
  }

  let itemsHtml = items
    .map(
      (item) =>
        `<tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${
          item.name || "Product"
        } (Qty: ${item.quantity || 1})</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">₹${(
          item.price * item.quantity
        ).toLocaleString("en-IN")}</td>
      </tr>`
    )
    .join("");

  const emailHtml = `...`;

  await sendEmail({
    to: user.email,
    subject: `Your SIT Dress Shop Order Confirmation #${orderId}`,
    html: emailHtml,
  });
};

exports.createOrder = async (req, res) => {
  const userId = req.user.userId;
  const { addressId, paymentMethod } = req.body;
  if (paymentMethod !== "COD")
    return res.status(400).json({ message: "Invalid payment method." });

  const client = await pool.connect();

  try {
    const userResult = await client.query(
      "SELECT fullname, email FROM Users WHERE userid = $1",
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      client.release();
      return res.status(404).json({ message: "User not found." });
    }

    await client.query("BEGIN");
    const { newOrderId, totalPrice, cartItems } = await _createOrderInDatabase(
      client,
      userId,
      addressId,
      "COD",
      "Pending"
    );
    await client.query("COMMIT");

    try {
      await sendOrderConfirmationEmail(user, newOrderId, totalPrice, cartItems);
    } catch (emailError) {
      console.error("COD order created, but failed to send email:", emailError);
    }

    res
      .status(201)
      .json({ message: "Order placed successfully!", orderId: newOrderId });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ message: err.message || "Failed to place order." });
  } finally {
    client.release();
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

  const client = await pool.connect();
  try {
    const userResult = await client.query(
      "SELECT fullname, email FROM Users WHERE userid = $1",
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      client.release();
      return res.status(404).json({ message: "User not found." });
    }

    await client.query("BEGIN");
    const { newOrderId, totalPrice, cartItems } = await _createOrderInDatabase(
      client,
      userId,
      addressId,
      "Online",
      "Paid"
    );
    await client.query(
      "UPDATE Orders SET RazorpayPaymentID = $1 WHERE OrderID = $2",
      [razorpay_payment_id, newOrderId]
    );
    await client.query("COMMIT");

    try {
      await sendOrderConfirmationEmail(user, newOrderId, totalPrice, cartItems);
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
    await client.query("ROLLBACK");
    res
      .status(500)
      .json({ message: err.message || "Failed to save order after payment." });
  } finally {
    client.release();
  }
};

exports.getOrders = async (req, res) => {
  const userId = req.user.userId;
  try {
    const query = `
          SELECT 
            o.orderid, o.orderdate, o.totalprice, o.orderstatus,
            oi.orderitemid, oi.quantity, oi.priceattimeoforder,
            p.productid, p.name as productName, p.thumbnail,
            ua.addressid, ua.addressline1, ua.addressline2, ua.city, ua.state, ua.postalcode
          FROM Orders o
          JOIN OrderItems oi ON o.orderid = oi.orderid
          JOIN Products p ON oi.productid = p.productid
          LEFT JOIN UserAddresses ua ON o.addressid = ua.addressid
          WHERE o.userid = $1
          ORDER BY o.orderdate DESC;
        `;
    const result = await pool.query(query, [userId]);

    const ordersMap = new Map();
    result.rows.forEach((row) => {
      if (!ordersMap.has(row.orderid)) {
        ordersMap.set(row.orderid, {
          orderid: row.orderid,
          orderdate: row.orderdate,
          totalprice: row.totalprice,
          orderstatus: row.orderstatus,
          shippingaddress: row.addressid
            ? {
                addressid: row.addressid,
                addressline1: row.addressline1,
                addressline2: row.addressline2,
                city: row.city,
                state: row.state,
                postalcode: row.postalcode,
              }
            : null,
          items: [],
        });
      }

      ordersMap.get(row.orderid).items.push({
        orderitemid: row.orderitemid,
        productid: row.productid,
        productname: row.productname,
        thumbnail: row.thumbnail,
        quantity: row.quantity,
        price: row.priceattimeoforder,
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
  const { page = 1, limit = 10 } = req.query;
  const pageNum = parseInt(page);
  const limitNum = parseInt(limit);
  const offset = (pageNum - 1) * limitNum;

  try {
    const countResult = await pool.query(
      "SELECT COUNT(*) as total FROM Orders"
    );
    const totalOrders = parseInt(countResult.rows[0].total);

    const ordersQuery = `
      SELECT o.orderid, o.orderdate, o.totalprice, o.orderstatus, u.fullname as username
      FROM Orders o JOIN Users u ON o.userid = u.userid
      ORDER BY o.orderdate DESC
      LIMIT $1 OFFSET $2;
    `;
    const ordersResult = await pool.query(ordersQuery, [limitNum, offset]);
    const orders = ordersResult.rows;

    if (orders.length > 0) {
      for (const order of orders) {
        const itemsQuery = `
          SELECT oi.orderitemid, oi.quantity, oi.priceattimeoforder, p.productid, p.name, p.thumbnail
          FROM OrderItems oi JOIN Products p ON oi.productid = p.productid
          WHERE oi.orderid = $1
        `;
        const itemsResult = await pool.query(itemsQuery, [order.orderid]);
        order.items = itemsResult.rows;
      }
    }

    res.status(200).json({
      orders: orders,
      totalPages: Math.ceil(totalOrders / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Error in getAllOrdersWithDetails:", error);
    res
      .status(500)
      .json({ message: "Error fetching orders from the database." });
  }
};

exports.getSalesSummary = async (req, res) => {
  try {
    const query = `
        SELECT 
            CAST(OrderDate AS DATE) as date,
            SUM(TotalPrice) as totalSales
        FROM Orders
        WHERE OrderStatus != 'Cancelled'
        GROUP BY CAST(OrderDate AS DATE)
        ORDER BY date ASC;
    `;
    const result = await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching sales summary:", error);
    res.status(500).json({ message: "Error fetching sales summary." });
  }
};

exports.updateOrderStatus = async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  if (!status) {
    return res.status(400).json({ message: "New status is required." });
  }

  try {
    const orderResult = await pool.query(
      "SELECT * FROM Orders WHERE OrderID = $1",
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: "Order not found." });
    }
    const order = orderResult.rows[0];

    await pool.query(`UPDATE Orders SET OrderStatus = $1 WHERE OrderID = $2`, [
      status,
      orderId,
    ]);

    if (status === "Shipped" || status === "Delivered") {
      const userResult = await pool.query(
        "SELECT fullname, email FROM Users WHERE userid = $1",
        [order.userid]
      );
      const user = userResult.rows[0];

      if (user) {
        await sendEmail({
          to: user.email,
          subject: `Your Order #${orderId} has been ${status}!`,
          message: `Hi ${user.fullname},\n\nGood news! Your order #${orderId} has been updated to '${status}'.\n\nYou can view your order details here: ${process.env.FRONTEND_URL}/my-orders\n\nThanks for shopping with us!\nThe SIT Dress Shop Team`,
        });
      }
    }

    res.status(200).json({ message: `Order status updated to ${status}.` });
  } catch (error) {
    console.error("Error updating order status:", error);
    res.status(500).json({ message: "Failed to update order status." });
  }
};

exports.cancelOrder = async (req, res) => {
  const userId = req.user.userId;
  const { orderId } = req.params;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let orderResult = await client.query(
      "SELECT orderid, orderstatus FROM Orders WHERE orderid = $1 AND userid = $2",
      [orderId, userId]
    );
    const order = orderResult.rows[0];
    if (!order)
      throw new Error(
        "Order not found or you do not have permission to cancel it."
      );
    if (order.orderstatus !== "Processing")
      throw new Error(
        `Order cannot be cancelled as it is in '${order.orderstatus}' state.`
      );

    const orderItemsResult = await client.query(
      "SELECT productid, quantity FROM OrderItems WHERE orderid = $1",
      [orderId]
    );
    const orderItems = orderItemsResult.rows;

    for (const item of orderItems) {
      await client.query(
        "UPDATE Products SET Stock = Stock + $1 WHERE ProductID = $2",
        [item.quantity, item.productid]
      );
    }
    await client.query(
      "UPDATE Orders SET OrderStatus = 'Cancelled' WHERE OrderID = $1",
      [orderId]
    );

    await client.query("COMMIT");
    res.status(200).json({ message: "Order has been successfully cancelled." });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(400).json({ message: err.message });
  } finally {
    client.release();
  }
};
exports.createRazorpayOrder = async (req, res) => {
  const { amount } = req.body;

  if (!amount) {
    return res.status(400).json({ message: "Amount is required." });
  }

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