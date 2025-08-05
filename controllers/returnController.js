const sql = require("mssql");
const dbConfig = require("../dbConfig");
const sendEmail = require("../utils/emailService");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.requestReturn = async (req, res) => {
  const userId = req.user.userId;
  const { orderItemId, reason, quantity } = req.body;

  if (!orderItemId || !reason || !quantity) {
    return res
      .status(400)
      .json({ message: "Order item, reason, and quantity are required." });
  }

  try {
    const pool = await sql.connect(dbConfig);

    const orderCheckQuery = `
      SELECT o.OrderID, oi.ProductID
      FROM Orders o JOIN OrderItems oi ON o.OrderID = oi.OrderID
      WHERE o.UserID = @UserID AND oi.OrderItemID = @OrderItemID AND o.OrderStatus = 'Delivered';
    `;
    const orderResult = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("OrderItemID", sql.Int, orderItemId)
      .query(orderCheckQuery);

    if (orderResult.recordset.length === 0) {
      return res
        .status(403)
        .json({ message: "You can only request returns for delivered items." });
    }
    const orderItem = orderResult.recordset[0];

    const existingReturnQuery = `SELECT ReturnID FROM ProductReturns WHERE OrderID = @OrderID AND ProductID = @ProductID`;
    const existingReturn = await pool
      .request()
      .input("OrderID", sql.Int, orderItem.OrderID)
      .input("ProductID", sql.Int, orderItem.ProductID)
      .query(existingReturnQuery);

    if (existingReturn.recordset.length > 0) {
      return res
        .status(409)
        .json({ message: "A return request for this item already exists." });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await new sql.Request(transaction)
        .input("OrderID", sql.Int, orderItem.OrderID)
        .input("UserID", sql.Int, userId)
        .input("ProductID", sql.Int, orderItem.ProductID)
        .input("Quantity", sql.Int, quantity)
        .input("Reason", sql.NVarChar, reason)
        .query(
          `INSERT INTO ProductReturns (OrderID, UserID, ProductID, Quantity, Reason) VALUES (@OrderID, @UserID, @ProductID, @Quantity, @Reason)`
        );

      await new sql.Request(transaction)
        .input("OrderID", sql.Int, orderItem.OrderID)
        .query(
          `UPDATE Orders SET OrderStatus = 'Return Requested' WHERE OrderID = @OrderID`
        );

      await transaction.commit();
      res
        .status(201)
        .json({ message: "Return request submitted successfully." });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (error) {
    console.error("Error submitting return request:", error);
    res.status(500).json({ message: "Failed to submit your return request." });
  }
};

exports.getAllReturns = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const pool = await sql.connect(dbConfig);

    const countResult = await pool
      .request()
      .query("SELECT COUNT(*) as total FROM ProductReturns");
    const totalReturns = countResult.recordset[0].total;

    const returnsQuery = `
      SELECT 
        r.ReturnID, r.OrderID, r.Quantity, r.Reason, r.ReturnStatus, r.RequestedAt,
        u.FullName AS CustomerName, p.Name AS ProductName
      FROM ProductReturns r
      JOIN Users u ON r.UserID = u.UserID
      JOIN Products p ON r.ProductID = p.ProductID
      ORDER BY r.RequestedAt DESC
      OFFSET @Offset ROWS
      FETCH NEXT @Limit ROWS ONLY;
    `;
    const returnsResult = await pool
      .request()
      .input("Offset", sql.Int, offset)
      .input("Limit", sql.Int, limitNum)
      .query(returnsQuery);
    const returns = returnsResult.recordset;

    res.status(200).json({
      returns,
      totalPages: Math.ceil(totalReturns / limitNum),
      currentPage: pageNum,
    });
  } catch (error) {
    console.error("Error fetching paginated return requests:", error);
    res.status(500).json({ message: "Failed to fetch return requests." });
  }
};

exports.updateReturnStatus = async (req, res) => {
  const { returnId } = req.params;
  const { status, adminComment } = req.body;

  if (!status)
    return res.status(400).json({ message: "New status is required." });

  let pool;
  try {
    pool = await sql.connect(dbConfig);

    const returnRequestResult = await pool
      .request()
      .input("ReturnID", sql.Int, returnId).query(`
        SELECT r.*, o.RazorpayPaymentID, u.FullName, u.Email, oi.PriceAtTimeOfOrder
        FROM ProductReturns r
        JOIN Orders o ON r.OrderID = o.OrderID
        JOIN Users u ON r.UserID = u.UserID
        JOIN OrderItems oi ON r.ProductID = oi.ProductID AND r.OrderID = oi.OrderID
        WHERE r.ReturnID = @ReturnID
    `);

    if (returnRequestResult.recordset.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }
    const returnRequest = returnRequestResult.recordset[0];

    if (returnRequest.ReturnStatus !== "Requested") {
      return res.status(400).json({
        message: `This request has already been processed with status '${returnRequest.ReturnStatus}'.`,
      });
    }

    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      let finalStatus = status;

      if (status === "Approved") {
        await new sql.Request(transaction)
          .input("Quantity", sql.Int, returnRequest.Quantity)
          .input("ProductID", sql.Int, returnRequest.ProductID)
          .query(
            `UPDATE Products SET Stock = Stock + @Quantity WHERE ProductID = @ProductID`
          );

        await new sql.Request(transaction)
          .input("OrderID", sql.Int, returnRequest.OrderID)
          .query(
            `UPDATE Orders SET OrderStatus = 'Returned' WHERE OrderID = @OrderID`
          );

        if (returnRequest.RazorpayPaymentID) {
          const refundAmount =
            returnRequest.PriceAtTimeOfOrder * returnRequest.Quantity;
          await razorpay.payments.refund(returnRequest.RazorpayPaymentID, {
            amount: Math.round(refundAmount * 100),
          });
          finalStatus = "Refunded";
        }
      }

      await new sql.Request(transaction)
        .input("ReturnID", sql.Int, returnId)
        .input("ReturnStatus", sql.NVarChar, finalStatus)
        .input("AdminComment", sql.NVarChar, adminComment || null)
        .query(
          `UPDATE ProductReturns SET ReturnStatus = @ReturnStatus, AdminComment = @AdminComment, UpdatedAt = GETUTCDATE() WHERE ReturnID = @ReturnID`
        );

      await transaction.commit();

      try {
        const emailMessage = `Hi ${
          returnRequest.FullName
        },\n\nAn update on your return request #${returnId}:\n\nYour request status has been updated to: ${finalStatus.toUpperCase()}.\n\nAdmin Comment: ${
          adminComment || "No comments."
        }\n\nThanks,\nThe SIT Dress Shop Team`;
        await sendEmail({
          to: returnRequest.Email,
          subject: `Update on your Return Request #${returnId}`,
          message: emailMessage,
        });
      } catch (emailError) {
        console.error(
          "Return status updated, but failed to send email:",
          emailError
        );
      }

      res.status(200).json({ message: "Return status updated successfully." });
    } catch (err) {
      await transaction.rollback();

      if (err.statusCode === 400 && err.error && err.error.description) {
        console.error("Razorpay API Error:", err.error.description);
        res
          .status(500)
          .json({ message: `Razorpay Error: ${err.error.description}` });
      } else {
        console.error("Database Transaction Error:", err);
        res.status(500).json({
          message: "Failed to update return status due to a database error.",
        });
      }
    }
  } catch (error) {
    console.error("Error in updateReturnStatus:", error);
    res.status(500).json({ message: "Failed to update return status." });
  }
};
