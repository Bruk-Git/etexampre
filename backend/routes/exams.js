// =============================================
// EXAM ROUTES
// Gets exam types and subjects from database
// =============================================

const express = require("express");
const router = express.Router();
const pool = require("../database");
const { authenticateToken } = require("../middleware/auth");

// All exam routes require user to be logged in
router.use(authenticateToken);

// ==========================================
// ROUTE: GET /api/exams
// Get all exam types with paper counts
// ==========================================
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        e.*,
        COUNT(DISTINCT qp.id) as paper_count
      FROM exam_types e
      LEFT JOIN question_papers qp ON qp.exam_type_id = e.id
      GROUP BY e.id
      ORDER BY e.display_order ASC
    `);

    res.json(result.rows);
  } catch (error) {
    console.error("Error fetching exams:", error);
    res.status(500).json({ error: "Failed to load exams." });
  }
});

// ==========================================
// ROUTE: GET /api/exams/:slug
// Get one exam type with its subjects
// ==========================================
router.get("/:slug", async (req, res) => {
  try {
    // Get exam type
    const examResult = await pool.query(
      "SELECT * FROM exam_types WHERE slug = $1",
      [req.params.slug],
    );

    if (examResult.rows.length === 0) {
      return res.status(404).json({ error: "Exam not found." });
    }

    const exam = examResult.rows[0];

    // Get subjects for this exam
    const subjectsResult = await pool.query(
      `
      SELECT 
        s.*,
        COUNT(DISTINCT qp.id) as paper_count
      FROM subjects s
      LEFT JOIN question_papers qp ON qp.subject_id = s.id
      WHERE s.exam_type_id = $1
      GROUP BY s.id
      ORDER BY s.display_order ASC
    `,
      [exam.id],
    );

    res.json({
      exam: exam,
      subjects: subjectsResult.rows,
    });
  } catch (error) {
    console.error("Error fetching exam:", error);
    res.status(500).json({ error: "Failed to load exam details." });
  }
});

module.exports = router;
