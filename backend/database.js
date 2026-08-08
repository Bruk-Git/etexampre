const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "exam_prep",
  user: process.env.DB_USER || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  max: 20, // Maximum number of clients
  idleTimeoutMillis: 30000,
});

// Test connection
pool.on("connect", () => {
  console.log("Connected to PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

// Initialize database tables
async function initializeDatabase() {
  const fs = require("fs");
  const path = require("path");

  try {
    const schema = fs.readFileSync(
      path.join(__dirname, "..", "database", "schema.sql"),
      "utf8",
    );

    await pool.query(schema);
    console.log("Database tables initialized");

    // Insert default data if not exists
    await seedDefaultData();
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Seed default exam types and subjects
async function seedDefaultData() {
  const { rows: examCount } = await pool.query(
    "SELECT COUNT(*) FROM exam_types",
  );

  if (parseInt(examCount[0].count) === 0) {
    const exams = [
      {
        name: "Grade 12 Entrance Exam",
        slug: "grade-12-entrance",
        description: "Ethiopian Higher Education Entrance Examination (EHEEE)",
        icon: "🎓",
        order: 1,
      },
      {
        name: "Grade 6 Ministry Exam",
        slug: "grade-6",
        description: "Grade 6 Regional Examination",
        icon: "📚",
        order: 2,
      },
      {
        name: "Grade 8 Ministry Exam",
        slug: "grade-8",
        description: "Grade 8 National Examination",
        icon: "📖",
        order: 3,
      },
      {
        name: "Exit Exam",
        slug: "exit-exam",
        description: "University Exit Examination",
        icon: "🏆",
        order: 4,
      },
      {
        name: "GAT",
        slug: "gat",
        description: "Graduate Admission Test",
        icon: "🧠",
        order: 5,
      },
      {
        name: "NGAT",
        slug: "ngat",
        description: "National Graduate Admission Test",
        icon: "💡",
        order: 6,
      },
    ];

    for (const exam of exams) {
      const result = await pool.query(
        "INSERT INTO exam_types (name, slug, description, icon, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        [exam.name, exam.slug, exam.description, exam.icon, exam.order],
      );

      // Add default subjects for each exam
      const examId = result.rows[0].id;
      const subjects = getDefaultSubjects(exam.slug, examId);

      for (const subject of subjects) {
        await pool.query(
          "INSERT INTO subjects (name, slug, exam_type_id, display_order) VALUES ($1, $2, $3, $4)",
          [subject.name, subject.slug, examId, subject.order],
        );
      }
    }

    console.log("Default data seeded successfully");
  }
}

function getDefaultSubjects(examSlug, examId) {
  const commonSubjects = [
    { name: "Mathematics", slug: "mathematics", order: 1 },
    { name: "English", slug: "english", order: 2 },
  ];

  switch (examSlug) {
    case "grade-12-entrance":
      return [
        ...commonSubjects,
        { name: "Physics", slug: "physics", order: 3 },
        { name: "Chemistry", slug: "chemistry", order: 4 },
        { name: "Biology", slug: "biology", order: 5 },
        { name: "History", slug: "history", order: 6 },
        { name: "Geography", slug: "geography", order: 7 },
        { name: "Civics", slug: "civics", order: 8 },
      ];
    case "grade-8":
      return [
        ...commonSubjects,
        { name: "General Science", slug: "general-science", order: 3 },
        { name: "Social Studies", slug: "social-studies", order: 4 },
      ];
    case "gat":
      return [
        { name: "Verbal Reasoning", slug: "verbal-reasoning", order: 1 },
        {
          name: "Quantitative Reasoning",
          slug: "quantitative-reasoning",
          order: 2,
        },
        {
          name: "Analytical Reasoning",
          slug: "analytical-reasoning",
          order: 3,
        },
      ];
    default:
      return commonSubjects;
  }
}

module.exports = { pool, initializeDatabase };
