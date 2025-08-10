const pool = require("../db");

exports.getAllProducts = async (req, res) => {
  try {
    const {
      category,
      minPrice,
      maxPrice,
      rating,
      sortBy,
      page = 1,
      limit = 12,
    } = req.query;
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let whereConditions = ["p.stock > 0"];
    let queryParams = [];
    let paramIndex = 1;

    if (category) {
      whereConditions.push(`p.category = $${paramIndex++}`);
      queryParams.push(category);
    }
    if (minPrice) {
      whereConditions.push(`p.price >= $${paramIndex++}`);
      queryParams.push(minPrice);
    }
    if (maxPrice) {
      whereConditions.push(`p.price <= $${paramIndex++}`);
      queryParams.push(maxPrice);
    }
    if (rating) {
      whereConditions.push(`p.rating >= $${paramIndex++}`);
      queryParams.push(rating);
    }
    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";

    let orderByClause = " ORDER BY p.createdat DESC";
    if (sortBy) {
      switch (sortBy) {
        case "price_asc":
          orderByClause = " ORDER BY p.price ASC";
          break;
        case "price_desc":
          orderByClause = " ORDER BY p.price DESC";
          break;
        case "name_asc":
          orderByClause = " ORDER BY p.name ASC";
          break;
      }
    }

    const paginationClause = `LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    queryParams.push(limitNum, offset);

    const countQuery = `SELECT COUNT(*) as total FROM Products p ${whereClause}`;
    const countResult = await pool.query(
      countQuery,
      queryParams.slice(0, paramIndex - 3)
    );
    const totalProducts = parseInt(countResult.rows[0].total);

    const productsQuery = `
      SELECT p.*, COALESCE(rev.AvgRating, p.Rating) as AvgRating, COALESCE(rev.ReviewCount, 0) as ReviewCount
      FROM Products p
      LEFT JOIN (
          SELECT ProductID, AVG(Rating) as AvgRating, COUNT(ReviewID) as ReviewCount 
          FROM ProductReviews GROUP BY ProductID
      ) rev ON p.productid = rev.productid
      ${whereClause} ${orderByClause} ${paginationClause}
    `;

    const productsResult = await pool.query(productsQuery, queryParams);
    const products = productsResult.rows;

    res.status(200).json({
      products,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      totalProducts: totalProducts,
    });
  } catch (error) {
    console.error("Error in getAllProducts:", error);
    res.status(500).json({ message: "Error fetching products." });
  }
};
exports.getProductsByCategory = async (req, res) => {
  
  req.query.category = req.params.categoryName;
  
  return exports.getAllProducts(req, res);
};

exports.getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM Products WHERE productid = $1",
      [id]
    );
    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      res.status(404).json({ message: "Product not found." });
    }
  } catch (error) {
    console.error(`Error fetching product by ID (${id}):`, error);
    res.status(500).json({ message: "Error fetching product." });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    const query = `
      WITH CategoryData AS (
        SELECT
          Category,
          Thumbnail,
          ROW_NUMBER() OVER(PARTITION BY Category ORDER BY ProductID) as rn,
          COUNT(*) OVER(PARTITION BY Category) as ProductCount
        FROM Products
        WHERE Category IS NOT NULL AND Category != ''
      )
      SELECT
        Category as name,
        Thumbnail as image,
        ProductCount as count
      FROM CategoryData
      WHERE rn = 1;
    `;
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ message: "Error fetching categories." });
  }
};

exports.searchProducts = async (req, res) => {
  const searchTerm = req.query.q;
  if (!searchTerm) {
    return res.status(400).json({ message: "Search term 'q' is required." });
  }

  try {
    const query = `
      SELECT * FROM Products
      WHERE Name ILIKE $1 
        OR Description ILIKE $1 
        OR Category ILIKE $1
        OR Brand ILIKE $1;
    `;
    const result = await pool.query(query, [`%${searchTerm}%`]);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error during product search:", error);
    res.status(500).json({ message: "Error searching for products." });
  }
};

exports.getNewArrivals = async (req, res) => {
  try {
    const query = "SELECT * FROM Products ORDER BY createdat DESC LIMIT 8";
    const result = await pool.query(query);
    res.status(200).json(result.rows);
  } catch (error) {
    console.error("Error fetching new arrivals:", error);
    res.status(500).json({ message: "Error fetching new products." });
  }
};

exports.createProduct = async (req, res) => {
  const {
    name,
    description,
    price,
    stock,
    brand,
    category,
    thumbnail,
    imagesjson,
    discountpercentage,
  } = req.body;

  if (!name || !price || !stock || !category || !thumbnail) {
    return res.status(400).json({
      message:
        "name, price, stock, category, and thumbnail are required fields.",
    });
  }

  try {
    const query = `
      INSERT INTO Products (name, description, price, stock, brand, category, thumbnail, imagesjson, discountpercentage)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING productid; 
    `;

    const values = [
      name,
      description,
      price,
      stock,
      brand,
      category,
      thumbnail,
      imagesjson || "[]",
      discountpercentage || 0,
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      message: "Product created successfully.",
      newProduct: {
        productid: result.rows[0].productid,
      },
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Error creating product." });
  }
};

exports.updateProduct = async (req, res) => {
  const { id } = req.params;

  const fieldsToUpdate = { ...req.body };
  delete fieldsToUpdate.id;

  if (Object.keys(fieldsToUpdate).length === 0) {
    return res.status(400).json({ message: "No data provided to update." });
  }

  try {
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(fieldsToUpdate)) {
      updateFields.push(`${key.toLowerCase()} = $${paramIndex++}`);
      updateValues.push(value);
    }

    updateValues.push(id);

    const query = `
      UPDATE products 
      SET ${updateFields.join(", ")} 
      WHERE productid = $${paramIndex};
    `;

    const result = await pool.query(query, updateValues);

    if (result.rowCount === 0) {
      return res
        .status(404)
        .json({ message: "Product not found or no new data to update." });
    }

    res.status(200).json({ message: "Product updated successfully." });
  } catch (error) {
    console.error(`Error updating product (${id}):`, error);
    res.status(500).json({ message: "Error updating product." });
  }
};

exports.deleteProduct = async (req, res) => {
  const { id } = req.params;

  try {
    const query = `DELETE FROM Products WHERE productid = $1;`;
    const result = await pool.query(query, [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({ message: "Product deleted successfully." });
  } catch (error) {
    if (error.code === "23503") {
      return res.status(400).json({
        message:
          "Cannot delete this product as it is part of an existing order. Please consider marking it as out of stock instead.",
      });
    }
    console.error(`Error deleting product (${id}):`, error);
    res.status(500).json({ message: "Error deleting product." });
  }
};

exports.getDealOfTheDay = async (req, res) => {
  try {
    const query = `
      SELECT * 
      FROM Products
      WHERE Stock > 0 AND DiscountPercentage > 0
      ORDER BY DiscountPercentage DESC
      LIMIT 1;
    `;
    const result = await pool.query(query);

    if (result.rows.length > 0) {
      res.status(200).json(result.rows[0]);
    } else {
      const fallbackQuery =
        "SELECT * FROM Products WHERE Stock > 0 ORDER BY createdat DESC LIMIT 1";
      const fallbackResult = await pool.query(fallbackQuery);

      if (fallbackResult.rows.length > 0) {
        res.status(200).json(fallbackResult.rows[0]);
      } else {
        res.status(404).json({ message: "No products available for a deal." });
      }
    }
  } catch (error) {
    console.error("Error fetching Deal of the Day:", error);
    res.status(500).json({ message: "Could not fetch deal of the day." });
  }
};

exports.getProductsStats = async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT COUNT(*) as totalproducts FROM Products"
    );

    const stats = {
      totalproducts: parseInt(result.rows[0].totalproducts),
    };
    res.status(200).json(stats);
  } catch (error) {
    console.error("Error fetching product stats:", error);
    res.status(500).json({ message: "Failed to get product stats." });
  }
};
