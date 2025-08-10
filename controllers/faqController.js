const pool = require("../db");
exports.getAllFAQs = async (req, res) => {
  try {
    const query = `
      SELECT FAQID, Question, Answer 
      FROM FAQ 
      WHERE IsActive = true 
      ORDER BY DisplayOrder ASC, FAQID ASC;
    `;
    const result = await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching FAQs:", error);
    res.status(500).json({ message: "Failed to fetch FAQs." });
  }
};

exports.createFAQ = async (req, res) => {
  const { Question, Answer, DisplayOrder } = req.body;
  if (!Question || !Answer) {
    return res
      .status(400)
      .json({ message: "Question and Answer are required." });
  }

  try {
    const query = `
      INSERT INTO FAQ (Question, Answer, DisplayOrder)
      VALUES ($1, $2, $3);
    `;

    const values = [Question, Answer, DisplayOrder || 0];

    await pool.query(query, values);

    res.status(201).json({ message: "FAQ created successfully." });
  } catch (error) {
    console.error("Error creating FAQ:", error);
    res.status(500).json({ message: "Failed to create FAQ." });
  }
};

exports.updateFAQ = async (req, res) => {
  const { id } = req.params;
  const { Question, Answer, IsActive, DisplayOrder } = req.body;

  try {
    const query = `
      UPDATE FAQ SET
        Question = $1,
        Answer = $2,
        IsActive = $3,
        DisplayOrder = $4
      WHERE FAQID = $5;
    `;
    const values = [Question, Answer, IsActive, DisplayOrder, id];

    await pool.query(query, values);

    res.status(200).json({ message: "FAQ updated successfully." });
  } catch (error) {
    console.error("Error updating FAQ:", error);
    res.status(500).json({ message: "Failed to update FAQ." });
  }
};

exports.deleteFAQ = async (req, res) => {
  const { id } = req.params;
  try {
    const query = `DELETE FROM FAQ WHERE FAQID = $1;`;
    const values = [id];

    await pool.query(query, values);

    res.status(200).json({ message: "FAQ deleted successfully." });
  } catch (error) {
    console.error("Error deleting FAQ:", error);
    res.status(500).json({ message: "Failed to delete FAQ." });
  }
};

exports.getAllFAQsForAdmin = async (req, res) => {
  try {
    const query = `SELECT * FROM FAQ ORDER BY DisplayOrder ASC, FAQID ASC;`;
    const result = await pool.query(query);

    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching FAQs for admin:", error);
    res.status(500).json({ message: "Failed to fetch FAQs for admin." });
  }
};
