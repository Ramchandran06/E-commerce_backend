const pool = require("../db"); 
exports.submitContactForm = async (req, res) => {
  const { fullName, email, subject, message } = req.body;

  if (!fullName || !email || !subject || !message) {
    return res.status(400).json({ message: "All fields are required." });
  }

  try {
    const query = `
      INSERT INTO ContactMessages (FullName, Email, Subject, Message)
      VALUES ($1, $2, $3, $4);
    `;
    const values = [fullName, email, subject, message];

    await pool.query(query, values);

    res
      .status(201)
      .json({ message: "Thank you! Your message has been received." });
  } catch (error) {
    console.error("Error saving contact message:", error);
    res.status(500).json({
      message: "Failed to send your message. Please try again later.",
    });
  }
};


exports.getAllMessages = async (req, res) => {
  try {
    const query = `SELECT * FROM ContactMessages ORDER BY ReceivedAt DESC;`;
    const result = await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching contact messages:", error);
    res.status(500).json({ message: "Failed to fetch messages." });
  }
};

exports.markMessageAsRead = async (req, res) => {
  const { messageId } = req.params;
  try {
   
    const query = `UPDATE ContactMessages SET IsRead = true WHERE MessageID = $1;`;
    const values = [messageId];

    await pool.query(query, values);

    res.status(200).json({ message: "Message marked as read." });
  } catch (error) {
    console.error("Error marking message as read:", error);
    res.status(500).json({ message: "Failed to update message status." });
  }
};
