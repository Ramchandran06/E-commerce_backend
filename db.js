require("dotenv").config();
const { Pool } = require("pg");

const connectionString = process.env.DATABASE_URL;

const sslConfig =
  process.env.NODE_ENV === "production"
    ? {
        
        ssl: { rejectUnauthorized: false },
      }
    : 
      {};

const pool = new Pool({
  connectionString: connectionString,
  ...sslConfig, 
});

pool.query("SELECT NOW()", (err, res) => {
  if (err) {
    console.error(" Error connecting to the database:", err.stack);
  } else {
    console.log(
      " Successfully connected to PostgreSQL database at:",
      res.rows[0].now
    );
  }
});

module.exports = pool;
