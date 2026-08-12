// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Import pool from database.js
const pool = require("./database");

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ==========================================
// REGISTER ROUTE
// ==========================================
app.post("/api/auth/register", async (req, res) => {
  console.log("📝 Registration attempt:", req.body.email);

  try {
    const {
      fullName,
      email,
      phone,
      grade,
      university,
      password,
      confirmPassword,
    } = req.body;

    // Validate required fields
    if (!fullName || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "All required fields must be filled." });
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    // Validate password length
    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: "Invalid email format." });
    }

    // Check if email already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "This email is already registered. Please login." });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, grade, institution, password) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, full_name, email, phone, grade, institution, role`,
      [
        fullName.trim(),
        email.toLowerCase().trim(),
        phone || null,
        grade || null,
        university || null,
        hashedPassword,
      ],
    );

    console.log("✅ User created:", result.rows[0].email);

    // Generate JWT token
    const token = jwt.sign(
      {
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role,
      },
      process.env.JWT_SECRET || "defaultSecretKey123",
      { expiresIn: "7d" },
    );

    // Send success response
    res.status(201).json({
      message: "Registration successful!",
      token: token,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Registration error:", error.message);

    // Check for specific errors
    if (error.code === "23505") {
      return res
        .status(409)
        .json({ error: "This email is already registered." });
    }
    if (error.code === "42P01") {
      return res
        .status(500)
        .json({
          error: "Database table not found. Please run schema.sql in pgAdmin.",
        });
    }
    if (error.code === "28P01") {
      return res
        .status(500)
        .json({
          error: "Database connection failed. Check .env file credentials.",
        });
    }

    res
      .status(500)
      .json({ error: "Registration failed. Server error: " + error.message });
  }
});

// ==========================================
// LOGIN ROUTE
// ==========================================
app.post("/api/auth/login", async (req, res) => {
  console.log("🔐 Login attempt:", req.body.email);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    // Find user
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email.toLowerCase().trim(),
    ]);

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "No account found with this email." });
    }

    const user = result.rows[0];

    // Check password
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Incorrect password." });
    }

    console.log("✅ Login successful:", user.email);

    // Generate token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || "defaultSecretKey123",
      { expiresIn: "7d" },
    );

    res.json({
      message: "Login successful!",
      token: token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
        grade: user.grade,
        university: user.institution,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("❌ Login error:", error.message);
    res.status(500).json({ error: "Login failed. Server error." });
  }
});

// ==========================================
// VERIFY TOKEN ROUTE
// ==========================================
app.get("/api/auth/verify", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided." });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "defaultSecretKey123",
    );
    res.json({ valid: true, user: decoded });
  } catch (error) {
    res.status(401).json({ error: "Invalid token." });
  }
});

// ==========================================
// FRONTEND ROUTES
// ==========================================
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "index.html"));
});

app.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "login.html"));
});

app.get("/register", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "register.html"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "dashboard.html"));
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Register: http://localhost:${PORT}/register`);
  console.log(`🔐 Login: http://localhost:${PORT}/login\n`);
});
