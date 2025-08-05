const sql = require("mssql");
const dbConfig = require("../dbConfig");

exports.getUserAddresses = async (req, res) => {
  const userId = req.user.userId;
  try {
    let pool = await sql.connect(dbConfig);
    const result = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query(
        "SELECT * FROM UserAddresses WHERE UserID = @UserID ORDER BY IsDefault DESC, AddressID DESC"
      );
    res.status(200).json(result.recordset);
  } catch (error) {
    console.error("Get User Addresses Error:", error);
    res.status(500).json({ message: "Error fetching user addresses." });
  }
};

exports.addAddress = async (req, res) => {
  const userId = req.user.userId;
  const { addressLine1, addressLine2, city, state, postalCode, country } =
    req.body;

  if (!addressLine1 || !city || !state || !postalCode || !country) {
    return res
      .status(400)
      .json({ message: "Please fill all required fields." });
  }

  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("UserID", sql.Int, userId)
      .input("AddressLine1", sql.NVarChar, addressLine1)
      .input("AddressLine2", sql.NVarChar, addressLine2)
      .input("City", sql.NVarChar, city)
      .input("State", sql.NVarChar, state)
      .input("PostalCode", sql.NVarChar, postalCode)
      .input("Country", sql.NVarChar, country).query(`
                 INSERT INTO UserAddresses (UserID, AddressLine1, AddressLine2, City, State, PostalCode, Country)
                 VALUES (@UserID, @AddressLine1, @AddressLine2, @City, @State, @PostalCode, @Country)
             `);

    const updatedAddresses = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query(
        "SELECT * FROM UserAddresses WHERE UserID = @UserID ORDER BY IsDefault DESC, AddressID DESC"
      );

    res.status(201).json({
      message: "Address added successfully!",
      addresses: updatedAddresses.recordset,
    });
  } catch (error) {
    console.error("Add Address Error:", error);
    res.status(500).json({ message: "Error adding new address." });
  }
};

exports.updateAddress = async (req, res) => {
  const userId = req.user.userId;
  const { addressId } = req.params;
  const { addressLine1, addressLine2, city, state, postalCode, country } =
    req.body;
  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("AddressID", sql.Int, addressId)
      .input("UserID", sql.Int, userId)
      .input("AddressLine1", sql.NVarChar, addressLine1)
      .input("AddressLine2", sql.NVarChar, addressLine2)
      .input("City", sql.NVarChar, city)
      .input("State", sql.NVarChar, state)
      .input("PostalCode", sql.NVarChar, postalCode)
      .input("Country", sql.NVarChar, country).query(`
                UPDATE UserAddresses SET
                AddressLine1 = @AddressLine1, AddressLine2 = @AddressLine2,
                City = @City, State = @State, PostalCode = @PostalCode, Country = @Country
                WHERE AddressID = @AddressID AND UserID = @UserID
            `);

    const updatedAddresses = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT * FROM UserAddresses WHERE UserID = @UserID");
    res.status(200).json({
      message: "Address updated",
      addresses: updatedAddresses.recordset,
    });
  } catch (error) {
    res.status(500).json({ message: "Error updating address" });
  }
};

exports.deleteAddress = async (req, res) => {
  const userId = req.user.userId;
  const { addressId } = req.params;
  try {
    let pool = await sql.connect(dbConfig);
    await pool
      .request()
      .input("AddressID", sql.Int, addressId)
      .input("UserID", sql.Int, userId)
      .query(
        "DELETE FROM UserAddresses WHERE AddressID = @AddressID AND UserID = @UserID"
      );

    const updatedAddresses = await pool
      .request()
      .input("UserID", sql.Int, userId)
      .query("SELECT * FROM UserAddresses WHERE UserID = @UserID");
    res.status(200).json({
      message: "Address deleted",
      addresses: updatedAddresses.recordset,
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting address" });
  }
};
