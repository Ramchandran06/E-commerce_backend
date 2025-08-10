const pool = require("../db");
const sendEmail = require("../utils/emailService");
const Razorpay = require("razorpay");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

exports.requestReturn = async (req, res) => {
  const userId = req.user.userId;
  const { orderItemId, reason, quantity } = req.body;

  if (!orderItemId || !reason || !quantity || quantity < 1) {
    return res
      .status(400)
      .json({
        message: "Order item, reason, and a valid quantity are required.",
      });
  }

  const client = await pool.connect();
  try {
    const orderCheckQuery = `
      SELECT o.orderid, oi.productid
      FROM Orders o JOIN OrderItems oi ON o.orderid = oi.orderid
      WHERE o.userid = $1 AND oi.orderitemid = $2 AND o.orderstatus = 'Delivered';
    `;
    const orderResult = await client.query(orderCheckQuery, [
      userId,
      orderItemId,
    ]);

    if (orderResult.rows.length === 0) {
      client.release();
      return res
        .status(403)
        .json({ message: "You can only request returns for delivered items." });
    }
    const orderItem = orderResult.rows[0];

    const existingReturnQuery = `SELECT returnid FROM ProductReturns WHERE orderid = $1 AND productid = $2`;
    const existingReturn = await client.query(existingReturnQuery, [
      orderItem.orderid,
      orderItem.productid,
    ]);

    if (existingReturn.rows.length > 0) {
      client.release();
      return res
        .status(409)
        .json({ message: "A return request for this item already exists." });
    }

    await client.query("BEGIN");

    await client.query(
      `INSERT INTO ProductReturns (OrderID, UserID, ProductID, Quantity, Reason) VALUES ($1, $2, $3, $4, $5)`,
      [orderItem.orderid, userId, orderItem.productid, quantity, reason]
    );

    await client.query(
      `UPDATE Orders SET OrderStatus = 'Return Requested' WHERE OrderID = $1`,
      [orderItem.orderid]
    );

    await client.query("COMMIT");

    res.status(201).json({ message: "Return request submitted successfully." });
  } catch (error) {
    if (client) await client.query("ROLLBACK");
    console.error("Error submitting return request:", error);
    res.status(500).json({ message: "Failed to submit your return request." });
  } finally {
    if (client) client.release();
  }
};

exports.getAllReturns = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const countResult = await pool.query(
      "SELECT COUNT(*) as total FROM ProductReturns"
    );
    const totalReturns = parseInt(countResult.rows[0].total);

    const returnsQuery = `
      SELECT 
        r.returnid, r.orderid, r.quantity, r.reason, r.returnstatus, r.requestedat,
        u.fullname AS customername, p.name AS productname
      FROM ProductReturns r
      JOIN Users u ON r.userid = u.userid
      JOIN Products p ON r.productid = p.productid
      ORDER BY r.requestedat DESC
      LIMIT $1 OFFSET $2;
    `;
    const returnsResult = await pool.query(returnsQuery, [limitNum, offset]);

    res.status(200).json({
      returns: returnsResult.rows,
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

  if (!status) {
    return res.status(400).json({ message: "New status is required." });
  }

  const client = await pool.connect();

  try {
    const returnRequestQuery = `
        SELECT r.*, o.razorpaypaymentid, u.fullname, u.email, oi.priceattimeoforder
        FROM ProductReturns r
        JOIN Orders o ON r.orderid = o.orderid
        JOIN Users u ON r.userid = u.userid
        JOIN OrderItems oi ON r.productid = oi.productid AND r.orderid = oi.orderid
        WHERE r.returnid = $1
    `;
    const returnRequestResult = await client.query(returnRequestQuery, [
      returnId,
    ]);

    if (returnRequestResult.rows.length === 0) {
      return res.status(404).json({ message: "Return request not found." });
    }
    const returnRequest = returnRequestResult.rows[0];

    if (returnRequest.returnstatus !== "Requested") {
      return res.status(400).json({
        message: `This request has already been processed with status '${returnRequest.returnstatus}'.`,
      });
    }

    await client.query("BEGIN");
    let finalStatus = status;

    if (status === "Approved") {
      await client.query(
        `UPDATE Products SET Stock = Stock + $1 WHERE ProductID = $2`,
        [returnRequest.quantity, returnRequest.productid]
      );

      await client.query(
        `UPDATE Orders SET OrderStatus = 'Returned' WHERE OrderID = $1`,
        [returnRequest.orderid]
      );

      if (returnRequest.razorpaypaymentid) {
        const refundAmount =
          returnRequest.priceattimeoforder * returnRequest.quantity;
        await razorpay.payments.refund(returnRequest.razorpaypaymentid, {
          amount: Math.round(refundAmount * 100),
        });
        finalStatus = "Refunded";
      }
    }

    await client.query(
      `UPDATE ProductReturns SET ReturnStatus = $1, AdminComment = $2, UpdatedAt = NOW() WHERE ReturnID = $3`,
      [finalStatus, adminComment || null, returnId]
    );

    await client.query("COMMIT");

    try {
      const emailMessage = `Hi ${
        returnRequest.fullname
      },\n\nAn update on your return request #${returnId}:\n\nYour request status has been updated to: ${finalStatus.toUpperCase()}.\n\nAdmin Comment: ${
        adminComment || "No comments."
      }\n\nThanks,\nThe SIT Dress Shop Team`;
      await sendEmail({
        to: returnRequest.email,
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
    await client.query("ROLLBACK");

    if (err.statusCode === 400 && err.error && err.error.description) {
      console.error("Razorpay API Error:", err.error.description);
      return res
        .status(500)
        .json({ message: `Razorpay Error: ${err.error.description}` });
    }

    console.error("Error in updateReturnStatus transaction:", err);
    res.status(500).json({
      message: "Failed to update return status due to a server error.",
    });
  } finally {
    client.release();
  }
};
