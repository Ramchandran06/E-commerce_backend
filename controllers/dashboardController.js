const pool = require("../db");
exports.getDashboardStats = async (req, res) => {
  try {
    const statsQuery = `
        SELECT 
            (SELECT SUM(TotalPrice) FROM Orders WHERE OrderStatus != 'Cancelled') as totalSales,
            (SELECT COUNT(*) FROM Orders) as totalOrders,
            (SELECT COUNT(*) FROM Products) as totalProducts;
    `;

    const result = await pool.query(statsQuery);

    res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("Error fetching dashboard stats:", error);
    res.status(500).json({ message: "Failed to fetch dashboard stats." });
  }
};
