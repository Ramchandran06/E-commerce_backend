const sql = require("mssql");
const dbConfig = require("../dbConfig");

exports.getAllFAQs = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      SELECT FAQID, Question, Answer 
      FROM FAQ 
      WHERE IsActive = 1 
      ORDER BY DisplayOrder ASC, FAQID ASC;
    `;
    const result = await pool.request().query(query);
    res.status(200).json(result.recordset);
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
    const pool = await sql.connect(dbConfig);
    const query = `
      INSERT INTO FAQ (Question, Answer, DisplayOrder)
      VALUES (@Question, @Answer, @DisplayOrder);
    `;
    await pool
      .request()
      .input("Question", sql.NVarChar, Question)
      .input("Answer", sql.NVarChar, Answer)
      .input("DisplayOrder", sql.Int, DisplayOrder || 0)
      .query(query);
    res.status(201).json({ message: "FAQ created successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to create FAQ." });
  }
};


exports.updateFAQ = async (req, res) => {
  const { id } = req.params;
  const { Question, Answer, IsActive, DisplayOrder } = req.body;

  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      UPDATE FAQ SET
        Question = @Question,
        Answer = @Answer,
        IsActive = @IsActive,
        DisplayOrder = @DisplayOrder
      WHERE FAQID = @FAQID;
    `;
    await pool
      .request()
      .input("FAQID", sql.Int, id)
      .input("Question", sql.NVarChar, Question)
      .input("Answer", sql.NVarChar, Answer)
      .input("IsActive", sql.Bit, IsActive)
      .input("DisplayOrder", sql.Int, DisplayOrder)
      .query(query);
    res.status(200).json({ message: "FAQ updated successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to update FAQ." });
  }
};


exports.deleteFAQ = async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await sql.connect(dbConfig);
    const query = `DELETE FROM FAQ WHERE FAQID = @FAQID;`;
    await pool.request().input("FAQID", sql.Int, id).query(query);
    res.status(200).json({ message: "FAQ deleted successfully." });
  } catch (error) {
    res.status(500).json({ message: "Failed to delete FAQ." });
  }
};

exports.getAllFAQsForAdmin = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `SELECT * FROM FAQ ORDER BY DisplayOrder ASC, FAQID ASC;`;
    const result = await pool.request().query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch FAQs for admin." });
  }
};
