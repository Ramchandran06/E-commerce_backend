const sql = require("mssql");
const dbConfig = require("../dbConfig");

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

    const pool = await sql.connect(dbConfig);
    const request = pool.request();

    // WHERE clause
    let whereClause = " WHERE p.Stock > 0";
    if (category) {
      whereClause += " AND p.Category = @Category";
      request.input("Category", sql.NVarChar, category);
    }
    if (minPrice) {
      whereClause += " AND p.Price >= @MinPrice";
      request.input("MinPrice", sql.Decimal(10, 2), minPrice);
    }
    if (maxPrice) {
      whereClause += " AND p.Price <= @MaxPrice";
      request.input("MaxPrice", sql.Decimal(10, 2), maxPrice);
    }
    if (rating) {
      whereClause += " AND p.Rating >= @Rating";
      request.input("Rating", sql.Decimal(2, 1), rating);
    }

    // ORDER BY clause
    let orderByClause = " ORDER BY p.CreatedAt DESC";
    if (sortBy) {
      switch (sortBy) {
        case "price_asc":
          orderByClause = " ORDER BY p.Price ASC";
          break;
        case "price_desc":
          orderByClause = " ORDER BY p.Price DESC";
          break;
        case "name_asc":
          orderByClause = " ORDER BY p.Name ASC";
          break;
      }
    }

    // Pagination clause
    const paginationClause = `OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`;
    request.input("Offset", sql.Int, offset);
    request.input("Limit", sql.Int, limitNum);

    // Count Query
    const countQuery = `SELECT COUNT(*) as total FROM Products p ${whereClause}`;
    const countResult = await request.query(countQuery);
    const totalProducts = countResult.recordset[0].total;

    // Main Products Query
    const productsQuery = `
      SELECT p.*, ISNULL(rev.AvgRating, p.Rating) as AvgRating, ISNULL(rev.ReviewCount, 0) as ReviewCount
      FROM Products p
      LEFT JOIN (
          SELECT ProductID, AVG(CAST(Rating AS FLOAT)) as AvgRating, COUNT(ReviewID) as ReviewCount 
          FROM ProductReviews GROUP BY ProductID
      ) rev ON p.ProductID = rev.ProductID
      ${whereClause} ${orderByClause} ${paginationClause}
    `;

    const productsResult = await request.query(productsQuery);
    const products = productsResult.recordset;

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

exports.getProductById = async (req, res) => {
  const { id } = req.params;
  try {
    let pool = await sql.connect(dbConfig);
    let result = await pool
      .request()
      .input("ProductID", sql.Int, id)
      .query("SELECT * FROM Products WHERE ProductID = @ProductID");

    const product = result.recordset[0];
    if (product) {
      res.status(200).json(product);
    } else {
      res.status(404).json({ message: "Product not found." });
    }
  } catch (error) {
    console.error(`Error fetching product by ID (${id}):`, error);
    res.status(500).json({ message: "Error fetching product." });
  }
};

exports.getProductsByCategory = async (req, res) => {
  const { categoryName } = req.params;

  const {
    minPrice,
    maxPrice,
    rating,
    sortBy,
    page = 1,
    limit = 12,
  } = req.query;

  try {
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    let pool = await sql.connect(dbConfig);
    const request = pool.request();

    let whereClause = " WHERE Category = @Category AND Stock > 0";
    request.input("Category", sql.NVarChar, categoryName);

    if (minPrice) {
      whereClause += " AND Price >= @MinPrice";
      request.input("MinPrice", sql.Decimal(10, 2), minPrice);
    }
    if (maxPrice) {
      whereClause += " AND Price <= @MaxPrice";
      request.input("MaxPrice", sql.Decimal(10, 2), maxPrice);
    }
    if (rating) {
      whereClause += " AND Rating >= @Rating";
      request.input("Rating", sql.Decimal(2, 1), rating);
    }

    let orderByClause = " ORDER BY CreatedAt DESC";
    if (sortBy) {
      switch (sortBy) {
        case "price_asc":
          orderByClause = " ORDER BY Price ASC";
          break;
        case "price_desc":
          orderByClause = " ORDER BY Price DESC";
          break;
        case "name_asc":
          orderByClause = " ORDER BY Name ASC";
          break;
        case "name_desc":
          orderByClause = " ORDER BY Name DESC";
          break;
        case "rating_desc":
          orderByClause = " ORDER BY Rating DESC";
          break;
        default:
          orderByClause = " ORDER BY CreatedAt DESC";
      }
    }

    const paginationClause = ` OFFSET @Offset ROWS FETCH NEXT @Limit ROWS ONLY`;
    request.input("Offset", sql.Int, offset);
    request.input("Limit", sql.Int, limitNum);

    const countQuery = `SELECT COUNT(*) as total FROM Products ${whereClause}`;
    const countResult = await request.query(countQuery);
    const totalProducts = countResult.recordset[0].total;

    const productsQuery = `SELECT * FROM Products ${whereClause} ${orderByClause} ${paginationClause}`;

    const productsResult = await request.query(productsQuery);
    const products = productsResult.recordset;

    res.status(200).json({
      products,
      totalPages: Math.ceil(totalProducts / limitNum),
      currentPage: pageNum,
      totalProducts: totalProducts,
    });
  } catch (error) {
    console.error("Error fetching products by category:", error);
    res.status(500).json({ message: "Error fetching products." });
  }
};

exports.getAllCategories = async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);
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
    let result = await pool.request().query(query);
    res.status(200).json(result.recordset);
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
    let pool = await sql.connect(dbConfig);
    const query = `
      SELECT * FROM Products
      WHERE Name LIKE @SearchTerm 
        OR Description LIKE @SearchTerm 
        OR Category LIKE @SearchTerm
        OR Brand LIKE @SearchTerm;
    `;
    let result = await pool
      .request()
      .input("SearchTerm", sql.NVarChar, `%${searchTerm}%`)
      .query(query);

    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error during product search:", error);
    res.status(500).json({ message: "Error searching for products." });
  }
};

exports.getNewArrivals = async (req, res) => {
  try {
    let pool = await sql.connect(dbConfig);

    const query = "SELECT TOP 8 * FROM Products ORDER BY CreatedAt DESC";
    const result = await pool.request().query(query);
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Error fetching new arrivals:", error);
    res.status(500).json({ message: "Error fetching new products." });
  }
};

exports.createProduct = async (req, res) => {
  const {
    Name,
    Description,
    Price,
    Stock,
    Brand,
    Category,
    Thumbnail,
    ImagesJSON,
    DiscountPercentage,
  } = req.body;

  if (!Name || !Price || !Stock || !Category || !Thumbnail) {
    return res.status(400).json({
      message:
        "Name, Price, Stock, Category, and Thumbnail are required fields.",
    });
  }

  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      INSERT INTO Products (Name, Description, Price, Stock, Brand, Category, Thumbnail, ImagesJSON, DiscountPercentage)
      VALUES (@Name, @Description, @Price, @Stock, @Brand, @Category, @Thumbnail, @ImagesJSON, @DiscountPercentage);
      SELECT SCOPE_IDENTITY() AS ProductID;
    `;

    const result = await pool
      .request()
      .input("Name", sql.NVarChar(255), Name)
      .input("Description", sql.NVarChar(sql.MAX), Description)
      .input("Price", sql.Decimal(10, 2), Price)
      .input("Stock", sql.Int, Stock)
      .input("Brand", sql.NVarChar(100), Brand)
      .input("Category", sql.NVarChar(100), Category)
      .input("Thumbnail", sql.NVarChar(sql.MAX), Thumbnail)
      .input("ImagesJSON", sql.NVarChar(sql.MAX), ImagesJSON || "[]")
      .input("DiscountPercentage", sql.Decimal(5, 2), DiscountPercentage || 0)
      .query(query);

    res.status(201).json({
      message: "Product created successfully.",
      newProduct: result.recordset[0],
    });
  } catch (error) {
    console.error("Error creating product:", error);
    res.status(500).json({ message: "Error creating product." });
  }
};

exports.updateProduct = async (req, res) => {
  const { id } = req.params;
  const {
    Name,
    Description,
    Price,
    Stock,
    Brand,
    Category,
    Thumbnail,
    ImagesJSON,
    DiscountPercentage,
  } = req.body;

  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      UPDATE Products SET
        Name = @Name,
        Description = @Description,
        Price = @Price,
        Stock = @Stock,
        Brand = @Brand,
        Category = @Category,
        Thumbnail = @Thumbnail,
        ImagesJSON = @ImagesJSON,
        DiscountPercentage = @DiscountPercentage
      WHERE ProductID = @ProductID;
    `;

    const result = await pool
      .request()
      .input("ProductID", sql.Int, id)
      .input("Name", sql.NVarChar(255), Name)
      .input("Description", sql.NVarChar(sql.MAX), Description)
      .input("Price", sql.Decimal(10, 2), Price)
      .input("Stock", sql.Int, Stock)
      .input("Brand", sql.NVarChar(100), Brand)
      .input("Category", sql.NVarChar(100), Category)
      .input("Thumbnail", sql.NVarChar(sql.MAX), Thumbnail)
      .input("ImagesJSON", sql.NVarChar(sql.MAX), ImagesJSON || "[]")
      .input("DiscountPercentage", sql.Decimal(5, 2), DiscountPercentage || 0)
      .query(query);

    if (result.rowsAffected[0] === 0) {
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
    const pool = await sql.connect(dbConfig);
    const query = `DELETE FROM Products WHERE ProductID = @ProductID;`;

    const result = await pool
      .request()
      .input("ProductID", sql.Int, id)
      .query(query);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({ message: "Product deleted successfully." });
  } catch (error) {
    console.error(`Error deleting product (${id}):`, error);
    res.status(500).json({ message: "Error deleting product." });
  }
};
exports.getDealOfTheDay = async (req, res) => {
  try {
    const pool = await sql.connect(dbConfig);
    const query = `
      SELECT TOP 1 * 
      FROM Products
      WHERE Stock > 0 AND DiscountPercentage > 0
      ORDER BY DiscountPercentage DESC;
    `;
    const result = await pool.request().query(query);

    if (result.recordset.length > 0) {
      res.status(200).json(result.recordset[0]);
    } else {
      const fallbackResult = await pool
        .request()
        .query(
          "SELECT TOP 1 * FROM Products WHERE Stock > 0 ORDER BY CreatedAt DESC"
        );
      if (fallbackResult.recordset.length > 0) {
        res.status(200).json(fallbackResult.recordset[0]);
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
    const pool = await sql.connect(dbConfig);
    const result = await pool
      .request()
      .query("SELECT COUNT(*) as totalProducts FROM Products");
    res.status(200).json(result.recordset[0]);
  } catch (error) {
    res.status(500).json({ message: "Failed to get product stats." });
  }
};
