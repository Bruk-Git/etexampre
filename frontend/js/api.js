// frontend/js/api.js
const API_BASE = "http://localhost:3000/api";

// Generic fetch with auth
async function fetchAPI(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    ...options,
  };

  // Don't set Content-Type for FormData
  if (options.body instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, config);

    if (response.status === 401 || response.status === 403) {
      // Token expired or invalid
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Something went wrong");
    }

    return await response.json();
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}

// Exam API
const ExamAPI = {
  getAll: () => fetchAPI("/exams"),
  getBySlug: (slug) => fetchAPI(`/exams/${slug}`),
};

// Paper API
const PaperAPI = {
  getByExamAndSubject: (examType, subject, year = "") => {
    const query = year ? `?year=${year}` : "";
    return fetchAPI(`/papers/${examType}/${subject}${query}`);
  },
  trackDownload: (paperId) => {
    return fetchAPI(`/papers/${paperId}/download`, { method: "POST" });
  },
};

// Upload API
const UploadAPI = {
  uploadPaper: (formData) => {
    const token = localStorage.getItem("token");
    return fetch(`${API_BASE}/upload`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    }).then((res) => res.json());
  },
};
