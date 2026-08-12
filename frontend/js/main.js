// =============================================
// MAIN JAVASCRIPT
// Handles homepage functionality
// =============================================

// Display exam types on homepage
async function loadHomepageExams() {
  const examsGrid = document.getElementById("examsGrid");
  if (!examsGrid) return;

  // If user is logged in, show real data from API
  if (localStorage.getItem("token")) {
    try {
      const response = await fetch("http://localhost:3000/api/exams", {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      });

      if (response.ok) {
        const exams = await response.json();
        displayExams(exams, examsGrid);
        return;
      }
    } catch (error) {
      console.log("Not logged in, showing sample data");
    }
  }

  // Show sample data for non-logged in users
  const sampleExams = [
    {
      name: "Grade 12 Entrance Exam",
      slug: "grade-12-entrance",
      description: "Ethiopian Higher Education Entrance Examination",
      icon: "🎓",
      paper_count: "8 subjects",
    },
    {
      name: "Grade 8 Ministry Exam",
      slug: "grade-8",
      description: "Grade 8 National Examination",
      icon: "📖",
      paper_count: "4 subjects",
    },
    {
      name: "Grade 6 Ministry Exam",
      slug: "grade-6",
      description: "Grade 6 Regional Examination",
      icon: "📚",
      paper_count: "3 subjects",
    },
    {
      name: "Exit Exam",
      slug: "exit-exam",
      description: "University Exit Examination",
      icon: "🏆",
      paper_count: "Coming soon",
    },
    {
      name: "GAT",
      slug: "gat",
      description: "Graduate Admission Test",
      icon: "🧠",
      paper_count: "Coming soon",
    },
    {
      name: "NGAT",
      slug: "ngat",
      description: "National Graduate Admission Test",
      icon: "💡",
      paper_count: "Coming soon",
    },
  ];

  displayExams(sampleExams, examsGrid);
}

// Display exam cards
function displayExams(exams, container) {
  container.innerHTML = exams
    .map(
      (exam) => `
    <div class="exam-card" onclick="handleExamClick('${exam.slug}')">
      <div class="exam-icon">${exam.icon || "📝"}</div>
      <h3>${exam.name}</h3>
      <p>${exam.description || ""}</p>
      <div class="exam-meta">
        <span>📄 ${exam.paper_count} ${typeof exam.paper_count === "number" ? "papers" : ""}</span>
        <span>→</span>
      </div>
    </div>
  `,
    )
    .join("");
}

// Handle exam card click
function handleExamClick(slug) {
  if (localStorage.getItem("token")) {
    window.location.href = `/exams?type=${slug}`;
  } else {
    // Not logged in - redirect to register
    alert("Please create an account to access exam papers. It's free!");
    window.location.href = "/register";
  }
}

// Initialize page
document.addEventListener("DOMContentLoaded", () => {
  loadHomepageExams();
});
