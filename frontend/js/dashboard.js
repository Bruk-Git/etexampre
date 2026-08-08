// frontend/js/dashboard.js

async function loadDashboard() {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "/login";
    return;
  }

  // Set user name
  document.getElementById("userFullName").textContent = user.fullName;
  document.getElementById("userName").textContent = user.fullName;

  // Load exams
  loadDashboardExams();
}

async function loadDashboardExams() {
  const grid = document.getElementById("dashboardExams");

  try {
    const exams = await ExamAPI.getAll();

    grid.innerHTML = exams
      .map(
        (exam) => `
      <a href="/exams?type=${exam.slug}" class="exam-card">
        <div class="exam-icon">${exam.icon || "📝"}</div>
        <h3>${exam.name}</h3>
        <p>${exam.description || ""}</p>
        <div class="exam-stats">
          <span>📄 ${exam.paper_count} papers</span>
          ${
            exam.user_attempts > 0
              ? `<span>⭐ ${Math.round(exam.user_avg_score)}% avg</span>`
              : ""
          }
        </div>
        <div class="exam-progress">
          <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
          </div>
        </div>
      </a>
    `,
      )
      .join("");
  } catch (error) {
    grid.innerHTML = '<div class="error">Failed to load exams</div>';
  }
}

// Initialize
document.addEventListener("DOMContentLoaded", loadDashboard);
