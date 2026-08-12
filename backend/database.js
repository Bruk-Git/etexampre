const { Pool } = require("pg");
require("dotenv").config();

// Create pool with connection settings
const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "exam_prep",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "",
  max: 20,
  idleTimeoutMillis: 30000,
});

// Test connection
pool.on("connect", () => {
  console.log("✅ Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("❌ Database error:", err.message);
});

// Initialize database - create tables if they don't exist
async function initializeDatabase() {
  try {
    console.log("📝 Checking database tables...");

    // Create users table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        full_name VARCHAR(100) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(20),
        grade VARCHAR(50),
        institution VARCHAR(200),
        role VARCHAR(20) DEFAULT 'student',
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Users table ready");

    // Create exam_types table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exam_types (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) UNIQUE NOT NULL,
        description TEXT,
        icon VARCHAR(10),
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Exam types table ready");

    // Create subjects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS subjects (
        id SERIAL PRIMARY KEY,
        name VARCHAR(200) NOT NULL,
        slug VARCHAR(100) NOT NULL,
        exam_type_id INTEGER REFERENCES exam_types(id) ON DELETE CASCADE,
        display_order INTEGER DEFAULT 0,
        UNIQUE(exam_type_id, slug)
      );
    `);
    console.log("✅ Subjects table ready");

    // Create question_papers table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS question_papers (
        id SERIAL PRIMARY KEY,
        title VARCHAR(300) NOT NULL,
        year INTEGER NOT NULL,
        exam_type_id INTEGER REFERENCES exam_types(id) ON DELETE CASCADE,
        subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
        file_path VARCHAR(500) NOT NULL,
        file_size VARCHAR(20),
        download_count INTEGER DEFAULT 0,
        uploaded_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ Question papers table ready");

    console.log("✅ Database initialization complete");
  } catch (error) {
    console.error("❌ Database initialization error:", error.message);
  }
}

// Export pool and initializeDatabase
module.exports = pool;
module.exports.initializeDatabase = initializeDatabase;
