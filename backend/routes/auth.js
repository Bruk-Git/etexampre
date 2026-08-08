const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../database");
const { authenticateToken, generateToken } = require("../middleware/auth");

// Register new user
router.post("/register", async (req, res) => {
  try {
    const { fullName, email, password, phone, grade, institution } = req.body;

    // Validate input
    if (!fullName || !email || !password) {
      return res
        .status(400)
        .json({ error: "Full name, email, and password are required." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }

    // Check if user exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase()],
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: "Email already registered." });
    }

    // Hash password
    const salt = await bcrypt.genSalt(12);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert user
    const result = await pool.query(
      `INSERT INTO users (full_name, email, password, phone, grade, institution) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, full_name, email, role, created_at`,
      [
        fullName,
        email.toLowerCase(),
        hashedPassword,
        phone,
        grade,
        institution,
      ],
    );

    const user = result.rows[0];

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      message: "Registration successful!",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// Login
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    // Find user
    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email.toLowerCase()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const user = result.rows[0];

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    // Update last login
    await pool.query(
      "UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1",
      [user.id],
    );

    // Generate token
    const token = generateToken(user);

    res.json({
      message: "Login successful!",
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.role,
        grade: user.grade,
        institution: user.institution,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// Get current user profile
router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, grade, institution, role, last_login, created_at 
       FROM users WHERE id = $1`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile error:", error);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// Update profile
router.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { fullName, phone, grade, institution } = req.body;

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           grade = COALESCE($3, grade),
           institution = COALESCE($4, institution),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, full_name, email, phone, grade, institution`,
      [fullName, phone, grade, institution, req.user.id],
    );

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({ error: "Failed to update profile." });
  }
});

module.exports = router;
