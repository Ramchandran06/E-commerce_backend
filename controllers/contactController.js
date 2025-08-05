const sql = require("mssql");
const dbConfig = require("../dbConfig");

exports.submitContactForm = async (req, res) => {
  const { fullName, email, subject, message } = req.body;

  if (!fullName || !email || !subject || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      INSERT INTO ContactMessages (FullName, Email, Subject, Message)
      VALUES (@FullName, @Email, @Subject, @Message);
    `;
    await pool
      .request()
      .input("FullName", sql.NVarChar, fullName)
      .input("Email", sql.NVarChar, email)
      .input("Subject", sql.NVarChar, subject)
      .input("Message", sql.NVarChar, message)
      .query(query);


    res
      .status(201)
      .json({ message: "Thank you! Your message has been received." });
  } catch (error) {
    console.error("Error saving contact message:", error);
    res
      .status(500)
      .json({
        message: "Failed to send your message. Please try again later.",
      });
  }
};

exports.getAllMessages = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `SELECT * FROM ContactMessages ORDER BY ReceivedAt DESC;`;
    const result = await pool.request().query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    res.status(500).json({ message: "Failed to fetch messages." });
  }
};


exports.markMessageAsRead = async (req, res) => {
  const { messageId } = req.params;
  try {
    const pool = await sql.connect(dbConfig);
    const query = `UPDATE ContactMessages SET IsRead = 1 WHERE MessageID = @MessageID;`;
    await pool.request().input("MessageID", sql.Int, messageId).query(query);
    res.status(200).json({ message: "Message marked as read." });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ message: "Failed to update message status." });
  }
};