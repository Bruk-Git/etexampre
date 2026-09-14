// Load environment variables
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

// Import pool from database.js
const pool = require("./database");
const app = express();
const PORT = process.env.PORT || 3000;
// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

// 1. Helmet - Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false, // Allow images/files
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow file serving
  }),
);

// 2. Rate Limiting - Prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 attempts per 15 min
  message: { error: "Too many attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 uploads per hour
  message: { error: "Upload limit reached. Try again later." },
});

// Apply general rate limit to all API routes
app.use("/api", generalLimiter);

// Apply strict rate limit to auth routes
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth/admin-login", authLimiter);
app.use("/api/auth/admin-register", authLimiter);

// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

// Verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "No token provided. Please login." });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "defaultSecretKey123",
    );
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: "Invalid or expired token." });
  }
}

// Check if user is admin
function isAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}
// ==========================================
// MULTER CONFIGURATION
// ==========================================
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, "uploads"));
  },
  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() + "-" + Math.round(Math.random() * 1e9) + ".pdf";
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") {
      cb(null, true);
    } else {
      cb(new Error("Only PDF files are allowed"));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from frontend
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==========================================
// AUTHENTICATION ROUTES
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

// ==========================================
// EXAM ROUTES
// ==========================================

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

    // Also make sure region_id IS NULL for non-region exams
    query += ` AND s.region_id IS NULL`;

    query += ` GROUP BY s.id ORDER BY s.display_order ASC`;

    const subjects = await pool.query(query, params);
    console.log("✅ Subjects found:", subjects.rows.length);

    res.json(subjects.rows);
  } catch (error) {
    console.error("Error fetching subjects:", error.message);
    res.status(500).json({ error: "Failed to load subjects" });
  }
});
// GET SUBJECTS FOR REGION
app.get("/api/exams/:examSlug/subjects-by-region", async (req, res) => {
  try {
    const { examSlug } = req.params;
    const { regionSlug } = req.query;

    const subjects = await pool.query(
      `
      SELECT DISTINCT ON (s.id)
        s.id, s.name, s.slug, s.exam_type_id, s.region_id, s.display_order,
        COUNT(DISTINCT qp.id) as paper_count,
        MIN(qp.year) as oldest_year,
        MAX(qp.year) as latest_year
      FROM subjects s
      JOIN exam_types et ON s.exam_type_id = et.id
      JOIN regions r ON s.region_id = r.id
      LEFT JOIN question_papers qp ON qp.subject_id = s.id
      WHERE et.slug = $1 AND r.slug = $2
      GROUP BY s.id, s.name, s.slug, s.exam_type_id, s.region_id, s.display_order
      ORDER BY s.id, s.display_order ASC
    `,
      [examSlug, regionSlug],
    );

    res.json(subjects.rows);
  } catch (error) {
    console.error("Error fetching subjects by region:", error.message);
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
// GET REGIONS FOR AN EXAM
app.get("/api/exams/:examSlug/regions", async (req, res) => {
  try {
    const { examSlug } = req.params;

    const regions = await pool.query(
      `
      SELECT r.*, 
        (SELECT COUNT(*) FROM subjects s WHERE s.region_id = r.id) as subject_count
      FROM regions r
      JOIN exam_types et ON r.exam_type_id = et.id
      WHERE et.slug = $1
      ORDER BY r.display_order ASC
    `,
      [examSlug],
    );

    res.json({
      hasRegions: regions.rows.length > 0,
      regions: regions.rows,
    });
  } catch (error) {
    console.error("Error fetching regions:", error.message);
    res.status(500).json({ error: "Failed to load regions" });
  }
});

// GET SUBJECTS FOR REGION
app.get("/api/exams/:examSlug/subjects-by-region", async (req, res) => {
  try {
    const { examSlug } = req.params;
    const { regionSlug } = req.query;

    const subjects = await pool.query(
      `
      SELECT s.*, 
        COUNT(DISTINCT qp.id) as paper_count,
        MIN(qp.year) as oldest_year,
        MAX(qp.year) as latest_year
      FROM subjects s
      JOIN exam_types et ON s.exam_type_id = et.id
      JOIN regions r ON s.region_id = r.id
      LEFT JOIN question_papers qp ON qp.subject_id = s.id
      WHERE et.slug = $1 AND r.slug = $2
      GROUP BY s.id
      ORDER BY s.display_order ASC
    `,
      [examSlug, regionSlug],
    );

    res.json(subjects.rows);
  } catch (error) {
    console.error("Error fetching subjects by region:", error.message);
    res.status(500).json({ error: "Failed to load subjects" });
  }
});
// TRACK DOWNLOAD
app.post("/api/papers/:id/download", async (req, res) => {
  try {
    await pool.query(
      "UPDATE question_papers SET download_count = download_count + 1 WHERE id = $1",
      [req.params.id],
    );
    res.json({ success: true });
  } catch (error) {
    console.error("Error tracking download:", error.message);
    res.status(500).json({ error: "Failed to track download" });
  }
});

// ==========================================
// ADMIN ROUTES (Protected - Admin only)
// ==========================================

// UPLOAD PAPER (Admin only)
app.post(
  "/api/admin/upload",
  authenticateToken,
  isAdmin,
  uploadLimiter,
  upload.single("file"),
  async (req, res) => {
    try {
      const { title, year, examTypeSlug, subjectSlug, streamSlug, regionSlug } =
        req.body;

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      // Find exam type
      const examResult = await pool.query(
        "SELECT id FROM exam_types WHERE slug = $1",
        [examTypeSlug],
      );
      if (examResult.rows.length === 0) {
        return res.status(404).json({ error: "Exam type not found" });
      }
      const examId = examResult.rows[0].id;

      // Find subject
      let subjectResult;
      if (regionSlug) {
        subjectResult = await pool.query(
          `SELECT s.id FROM subjects s
         JOIN regions r ON s.region_id = r.id
         WHERE s.slug = $1 AND s.exam_type_id = $2 AND r.slug = $3`,
          [subjectSlug, examId, regionSlug],
        );
      } else {
        subjectResult = await pool.query(
          "SELECT id FROM subjects WHERE slug = $1 AND exam_type_id = $2",
          [subjectSlug, examId],
        );
      }

      if (subjectResult.rows.length === 0) {
        return res.status(404).json({ error: "Subject not found." });
      }
      const subjectId = subjectResult.rows[0].id;

      let streamId = null;
      if (streamSlug) {
        const sr = await pool.query(
          "SELECT id FROM exam_streams WHERE slug = $1",
          [streamSlug],
        );
        if (sr.rows.length > 0) streamId = sr.rows[0].id;
      }

      let regionId = null;
      if (regionSlug) {
        const rr = await pool.query(
          "SELECT id FROM regions WHERE slug = $1 AND exam_type_id = $2",
          [regionSlug, examId],
        );
        if (rr.rows.length > 0) regionId = rr.rows[0].id;
      }

      const result = await pool.query(
        `INSERT INTO question_papers (title, year, exam_type_id, subject_id, stream_id, region_id, file_path, file_size, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, title`,
        [
          title || `${subjectSlug} ${year}`,
          parseInt(year),
          examId,
          subjectId,
          streamId,
          regionId,
          "/uploads/" + req.file.filename,
          (req.file.size / (1024 * 1024)).toFixed(1) + " MB",
          req.user.id,
        ],
      );

      console.log(
        `✅ Paper uploaded by admin ${req.user.email}:`,
        result.rows[0].title,
      );

      res.json({
        message: "Paper uploaded successfully!",
        paper: result.rows[0],
      });
    } catch (error) {
      console.error("Upload error:", error.message);
      res.status(500).json({ error: "Upload failed: " + error.message });
    }
  },
);

// GET ALL PAPERS (Admin only)
app.get("/api/admin/papers", authenticateToken, isAdmin, async (req, res) => {
  try {
    const papers = await pool.query(`
      SELECT 
        qp.*, 
        s.name as subject_name,
        s.slug as subject_slug,
        et.name as exam_name,
        et.slug as exam_slug,
        es.name as stream_name,
        r.name as region_name
      FROM question_papers qp
      JOIN subjects s ON qp.subject_id = s.id
      JOIN exam_types et ON qp.exam_type_id = et.id
      LEFT JOIN exam_streams es ON qp.stream_id = es.id
      LEFT JOIN regions r ON qp.region_id = r.id
      ORDER BY qp.created_at DESC
    `);
    res.json(papers.rows);
  } catch (error) {
    console.error("Error fetching papers:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// DELETE PAPER (Admin only)
app.delete(
  "/api/admin/papers/:id",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      await pool.query("DELETE FROM question_papers WHERE id = $1", [
        req.params.id,
      ]);
      res.json({ message: "Paper deleted successfully" });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  },
);

// GET ALL USERS (Admin only)
app.get("/api/admin/users", authenticateToken, isAdmin, async (req, res) => {
  try {
    const users = await pool.query(`
      SELECT id, full_name, email, phone, grade, institution, role, is_active, created_at
      FROM users ORDER BY created_at DESC
    `);
    res.json(users.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ALL ADMINS (Admin only)
app.get("/api/admin/admins", authenticateToken, isAdmin, async (req, res) => {
  try {
    const admins = await pool.query(`
      SELECT id, full_name, email, phone, role, created_at
      FROM users WHERE role = 'admin'
      ORDER BY created_at DESC
    `);
    res.json(admins.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET ALL SUBJECTS (Admin only)
app.get("/api/admin/subjects", authenticateToken, isAdmin, async (req, res) => {
  try {
    const subjects = await pool.query(`
      SELECT 
        s.id, s.name, s.slug, s.display_order,
        et.name as exam_name, et.slug as exam_slug,
        es.name as stream_name,
        r.name as region_name,
        (SELECT COUNT(*) FROM question_papers qp WHERE qp.subject_id = s.id) as paper_count
      FROM subjects s
      JOIN exam_types et ON s.exam_type_id = et.id
      LEFT JOIN exam_streams es ON s.stream_id = es.id
      LEFT JOIN regions r ON s.region_id = r.id
      ORDER BY et.display_order, es.display_order, r.display_order, s.display_order
    `);
    res.json(subjects.rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET STATS (Admin only)
app.get("/api/admin/stats", authenticateToken, isAdmin, async (req, res) => {
  try {
    const papers = await pool.query(
      "SELECT COUNT(*) as count, COALESCE(SUM(download_count), 0) as downloads FROM question_papers",
    );
    const users = await pool.query("SELECT COUNT(*) as count FROM users");

    res.json({
      papers: parseInt(papers.rows[0].count),
      downloads: parseInt(papers.rows[0].downloads),
      users: parseInt(users.rows[0].count),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// CREATE NEW ADMIN (Admin only)
app.post(
  "/api/admin/create-admin",
  authenticateToken,
  isAdmin,
  async (req, res) => {
    try {
      const { fullName, email, phone, password } = req.body;

      if (!fullName || !email || !password) {
        return res
          .status(400)
          .json({ error: "All required fields must be filled." });
      }

      if (password.length < 8) {
        return res
          .status(400)
          .json({ error: "Password must be at least 8 characters." });
      }

      const existing = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email.toLowerCase().trim()],
      );

      if (existing.rows.length > 0) {
        return res
          .status(409)
          .json({ error: "This email is already registered." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const result = await pool.query(
        `INSERT INTO users (full_name, email, phone, password, role) 
       VALUES ($1, $2, $3, $4, 'admin') 
       RETURNING id, full_name, email, phone, role, created_at`,
        [
          fullName.trim(),
          email.toLowerCase().trim(),
          phone || null,
          hashedPassword,
        ],
      );

      console.log(
        `✅ New admin created by ${req.user.email}: ${result.rows[0].email}`,
      );

      res.status(201).json({
        message: "Admin created successfully!",
        admin: result.rows[0],
      });
    } catch (error) {
      console.error("Admin creation error:", error.message);
      res.status(500).json({ error: "Failed to create admin." });
    }
  },
);
// ==========================================
// PROFILE ROUTES
// ==========================================

// GET PROFILE (Protected)
app.get("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, email, phone, grade, institution, role, last_login, created_at
       FROM users WHERE id = $1 AND is_active = true`,
      [req.user.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("Profile fetch error:", error.message);
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// UPDATE PROFILE (Protected)
app.put("/api/auth/profile", authenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided." });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "defaultSecretKey123",
    );

    const { fullName, phone, grade, institution } = req.body;

    if (fullName && fullName.trim().length < 3) {
      return res
        .status(400)
        .json({ error: "Name must be at least 3 characters." });
    }

    const result = await pool.query(
      `UPDATE users 
       SET full_name = COALESCE($1, full_name),
           phone = COALESCE($2, phone),
           grade = COALESCE($3, grade),
           institution = COALESCE($4, institution),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $5
       RETURNING id, full_name, email, phone, grade, institution, role`,
      [
        fullName || null,
        phone || null,
        grade || null,
        institution || null,
        req.user.id,
      ],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "User not found." });
    }

    res.json({
      message: "Profile updated successfully!",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Profile update error:", error.message);
    res.status(500).json({ error: "Failed to update profile." });
  }
});
// ==========================================
// ADMIN AUTH ROUTES
// ==========================================

// ADMIN LOGIN
app.post("/api/auth/admin-login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ error: "Email and password are required." });
    }

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND role = 'admin' AND is_active = true",
      [email.toLowerCase().trim()],
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);

    if (!validPassword) {
      return res.status(401).json({ error: "Invalid admin credentials." });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: "admin",
        fullName: user.full_name,
      },
      process.env.JWT_SECRET || "defaultSecretKey123",
      { expiresIn: "7d" },
    );

    res.json({
      message: "Admin login successful!",
      token: token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: "admin",
      },
    });
  } catch (error) {
    console.error("Admin login error:", error.message);
    res.status(500).json({ error: "Login failed." });
  }
});

// ADMIN REGISTER (Requires secret key)
app.post("/api/auth/admin-register", async (req, res) => {
  try {
    const { fullName, email, phone, password, secretKey } = req.body;

    // Validate secret key
    const ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY || "AdminSecret2026!";

    if (secretKey !== ADMIN_SECRET_KEY) {
      return res.status(403).json({ error: "Invalid admin secret key." });
    }

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

    // Check if email exists
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
      `INSERT INTO users (full_name, email, phone, password, role) 
       VALUES ($1, $2, $3, $4, 'admin') 
       RETURNING id, full_name, email, role`,
      [
        fullName.trim(),
        email.toLowerCase().trim(),
        phone || null,
        hashedPassword,
      ],
    );

    res.status(201).json({
      message: "Admin account created successfully!",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Admin registration error:", error.message);
    res.status(500).json({ error: "Registration failed." });
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

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin.html"));
});
app.get("/profile", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});

app.get("/profile.html", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "profile.html"));
});
app.get("/admin-login", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-login.html"));
});

app.get("/admin-register", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "admin-register.html"));
});
// ==========================================
// ERROR HANDLING
// ==========================================
app.use((err, req, res, next) => {
  console.error("Server error:", err.message);
  res.status(500).json({ error: "Server error: " + err.message });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(PORT, () => {
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`📝 Register: http://localhost:${PORT}/register`);
  console.log(`🔐 Login: http://localhost:${PORT}/login`);
  console.log(`📊 Dashboard: http://localhost:${PORT}/dashboard`);
  console.log(`🛠️ Admin: http://localhost:${PORT}/admin`);
  console.log(`📚 Streams: http://localhost:${PORT}/streams.html`);
  console.log(`📖 Subjects: http://localhost:${PORT}/subjects.html`);
  console.log(`📄 Papers: http://localhost:${PORT}/papers.html`);
  console.log(`🗺️ Regions: http://localhost:${PORT}/regions.html\n`);
});
