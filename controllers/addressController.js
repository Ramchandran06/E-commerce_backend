const pool = require("../db");

exports.getUserAddresses = async (req, res) => {
  const userId = req.user.userId;
  try {
    const query =
      "SELECT * FROM UserAddresses WHERE UserID = $1 ORDER BY IsDefault DESC, AddressID DESC";
    const values = [userId];

    const result = await pool.query(query, values);

    res.status(200).json(result.rows);
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
    const insertQuery = `
        INSERT INTO UserAddresses (UserID, AddressLine1, AddressLine2, City, State, PostalCode, Country)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
    `;
    const insertValues = [
      userId,
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
    ];

    await pool.query(insertQuery, insertValues);

    const selectQuery =
      "SELECT * FROM UserAddresses WHERE UserID = $1 ORDER BY IsDefault DESC, AddressID DESC";
    const selectValues = [userId];

    const updatedAddresses = await pool.query(selectQuery, selectValues);

    res.status(201).json({
      message: "Address added successfully!",
      addresses: updatedAddresses.rows,
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
    const updateQuery = `
        UPDATE UserAddresses 
        SET AddressLine1 = $1, AddressLine2 = $2, City = $3, State = $4, PostalCode = $5, Country = $6
        WHERE AddressID = $7 AND UserID = $8
    `;
    const updateValues = [
      addressLine1,
      addressLine2,
      city,
      state,
      postalCode,
      country,
      addressId,
      userId,
    ];

    await pool.query(updateQuery, updateValues);

    const selectQuery =
      "SELECT * FROM UserAddresses WHERE UserID = $1 ORDER BY IsDefault DESC, AddressID DESC";
    const selectValues = [userId];
    const updatedAddresses = await pool.query(selectQuery, selectValues);

    res.status(200).json({
      message: "Address updated",
      addresses: updatedAddresses.rows,
    });
  } catch (error) {
    console.error("Update Address Error:", error);
    res.status(500).json({ message: "Error updating address" });
  }
};

exports.deleteAddress = async (req, res) => {
  const userId = req.user.userId;
  const { addressId } = req.params;
  try {
    const deleteQuery =
      "DELETE FROM UserAddresses WHERE AddressID = $1 AND UserID = $2";
    const deleteValues = [addressId, userId];

    await pool.query(deleteQuery, deleteValues);

    const selectQuery =
      "SELECT * FROM UserAddresses WHERE UserID = $1 ORDER BY IsDefault DESC, AddressID DESC";
    const selectValues = [userId];
    const updatedAddresses = await pool.query(selectQuery, selectValues);

    res.status(200).json({
      message: "Address deleted",
      addresses: updatedAddresses.rows,
    });
  } catch (error) {
    console.error("Delete Address Error:", error);
    res.status(500).json({ message: "Error deleting address" });
  }
};
