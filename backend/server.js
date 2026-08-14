// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// Import pool from database.js
const pool = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// ==========================================
// API ROUTES - Must be BEFORE frontend routes
// ==========================================

// REGISTER
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

    if (!fullName || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ error: "All required fields must be filled." });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match." });
    }

    if (password.length < 8) {
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters." });
    }

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email.toLowerCase().trim()],
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(409)
        .json({ error: "This email is already registered." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

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

    const token = jwt.sign(
      {
        id: result.rows[0].id,
        email: result.rows[0].email,
        role: result.rows[0].role,
      },
      process.env.JWT_SECRET || "defaultSecretKey123",
      { expiresIn: "7d" },
    );

    res.status(201).json({
      message: "Registration successful!",
      token: token,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("❌ Registration error:", error.message);
    res.status(500).json({ error: "Registration failed: " + error.message });
  }
});

// LOGIN
app.post("/api/auth/login", async (req, res) => {
  console.log("🔐 Login attempt:", req.body.email);

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND is_active = true",
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return res
        .status(401)
        .json({ error: "No account found with this email." });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Incorrect password." });
    }

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
    res.status(500).json({ error: "Login failed." });
  }
});

// VERIFY TOKEN
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

// GET ALL EXAMS
app.get("/api/exams", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT e.*, COUNT(DISTINCT qp.id) as paper_count
      FROM exam_types e
      LEFT JOIN question_papers qp ON qp.exam_type_id = e.id
      GROUP BY e.id
      ORDER BY e.display_order ASC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching exams:", error.message);
    res.status(500).json({ error: "Failed to load exams" });
  }
});

// GET STREAMS FOR AN EXAM
app.get("/api/exams/:examSlug/streams", async (req, res) => {
  try {
    const { examSlug } = req.params;
    console.log("🔍 Fetching streams for:", examSlug);

    const streams = await pool.query(
      `
      SELECT es.*, 
        (SELECT COUNT(*) FROM subjects s WHERE s.stream_id = es.id) as subject_count
      FROM exam_streams es
      JOIN exam_types et ON es.exam_type_id = et.id
      WHERE et.slug = $1
      ORDER BY es.display_order ASC
    `,
      [examSlug],
    );

    console.log("✅ Streams found:", streams.rows.length);

    res.json({
      hasStreams: streams.rows.length > 0,
      streams: streams.rows,
    });
  } catch (error) {
    console.error("Error fetching streams:", error.message);
    res.status(500).json({ error: "Failed to load streams" });
  }
});

// GET SUBJECTS
app.get("/api/exams/:examSlug/subjects", async (req, res) => {
  try {
    const { examSlug } = req.params;
    const { streamSlug } = req.query;

    console.log("🔍 Fetching subjects for:", examSlug, "stream:", streamSlug);

    let query = `
      SELECT s.*, 
        COUNT(DISTINCT qp.id) as paper_count,
        MIN(qp.year) as oldest_year,
        MAX(qp.year) as latest_year
      FROM subjects s
      JOIN exam_types et ON s.exam_type_id = et.id
      LEFT JOIN question_papers qp ON qp.subject_id = s.id
      WHERE et.slug = $1
    `;

    const params = [examSlug];

    if (streamSlug && streamSlug !== "") {
      query += ` AND s.stream_id = (SELECT id FROM exam_streams WHERE slug = $2)`;
      params.push(streamSlug);
    } else {
      query += ` AND s.stream_id IS NULL`;
    }

    query += ` GROUP BY s.id ORDER BY s.display_order ASC`;

    const subjects = await pool.query(query, params);

    console.log("✅ Subjects found:", subjects.rows.length);

    res.json(subjects.rows);
  } catch (error) {
    console.error("Error fetching subjects:", error.message);
    res.status(500).json({ error: "Failed to load subjects" });
  }
});

// GET PAPERS FOR A SUBJECT
app.get("/api/papers/:subjectSlug", async (req, res) => {
  try {
    const { subjectSlug } = req.params;

    const papers = await pool.query(
      `
      SELECT qp.*, s.name as subject_name, et.name as exam_name
      FROM question_papers qp
      JOIN subjects s ON qp.subject_id = s.id
      JOIN exam_types et ON qp.exam_type_id = et.id
      WHERE s.slug = $1
      ORDER BY qp.year DESC
    `,
      [subjectSlug],
    );

    res.json(papers.rows);
  } catch (error) {
    console.error("Error fetching papers:", error.message);
    res.status(500).json({ error: "Failed to load papers" });
  }
});

// ==========================================
// FRONTEND ROUTES - Must be AFTER API routes
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

app.get("/streams.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "streams.html"));
});

app.get("/streams", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "streams.html"));
});

app.get("/subjects.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "subjects.html"));
});

app.get("/subjects", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "subjects.html"));
});

app.get("/papers.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "papers.html"));
});

app.get("/papers", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "papers.html"));
});
app.get("/regions.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "regions.html"));
});

app.get("/regions", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "regions.html"));
});
// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Register: http://localhost:${PORT}/register`);
  console.log(`🔐 Login: http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`📚 Streams: http://localhost:${PORT}/streams.html`);
  console.log(`📖 Subjects: http://localhost:${PORT}/subjects.html`);
  console.log(`📄 Papers: http://localhost:${PORT}/papers.html\n`);
});
