const express = require("express");
const router = express.Router();
const { pool } = require("../database");
const { authenticateToken } = require("../middleware/auth");

// All exam routes require authentication
router.use(authenticateToken);

// Get all exam types with user progress
router.get("/", async (req, res) => {
  try {
    const exams = await pool.query(
      `
      SELECT e.*, 
        COUNT(DISTINCT qp.id) as paper_count,
        COUNT(DISTINCT ua.id) as user_attempts,
        COALESCE(AVG(ua.score), 0) as user_avg_score
      FROM exam_types e
      LEFT JOIN question_papers qp ON qp.exam_type_id = e.id
      LEFT JOIN quiz_attempts ua ON ua.exam_type_id = e.id AND ua.user_id = $1
      GROUP BY e.id
      ORDER BY e.display_order
    `,
      [req.user.id],
    );

    res.json(exams.rows);
  } catch (error) {
    console.error("Error fetching exams:", error);
    res.status(500).json({ error: error.message });
  }
});

// Get exam details with subjects
router.get("/:slug", async (req, res) => {
  try {
    const exam = await pool.query("SELECT * FROM exam_types WHERE slug = $1", [
      req.params.slug,
    ]);

    if (exam.rows.length === 0) {
      return res.status(404).json({ error: "Exam not found" });
    }

    const subjects = await pool.query(
      `
      SELECT s.*,
        COUNT(DISTINCT qp.id) as paper_count,
        COUNT(DISTINCT ua.id) as quiz_count,
        COALESCE(AVG(ua.score), 0) as average_score,
        up.papers_downloaded,
        up.quizzes_taken,
        up.average_score as user_avg
      FROM subjects s
      LEFT JOIN question_papers qp ON qp.subject_id = s.id
      LEFT JOIN quiz_attempts ua ON ua.subject_id = s.id AND ua.user_id = $2
      LEFT JOIN user_progress up ON up.subject_id = s.id AND up.user_id = $2
      WHERE s.exam_type_id = $1
      GROUP BY s.id, up.papers_downloaded, up.quizzes_taken, up.average_score
      ORDER BY s.display_order
    `,
      [exam.rows[0].id, req.user.id],
    );

    res.json({
      exam: exam.rows[0],
      subjects: subjects.rows,
    });
  } catch (error) {
    console.error("Error fetching exam details:", error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
