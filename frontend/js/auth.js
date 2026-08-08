// frontend/js/auth.js

// Check if user is already logged in
function checkAuth() {
  const token = localStorage.getItem("token");
  const currentPath = window.location.pathname;

  // If on auth pages and already logged in, redirect to dashboard
  if ((currentPath === "/login" || currentPath === "/register") && token) {
    window.location.href = "/dashboard";
    return;
  }

  // If on protected pages and not logged in, redirect to login
  const protectedPaths = ["/exams", "/papers", "/dashboard"];
  const isProtectedPage = protectedPaths.some((path) =>
    currentPath.startsWith(path),
  );

  if (isProtectedPage && !token) {
    window.location.href = "/login";
    return;
  }
}

// Show message to user
function showMessage(message, type = "error") {
  const messageBox = document.getElementById("messageBox");
  if (!messageBox) return;

  messageBox.innerHTML = `
    <div class="message ${type}">
      ${message}
    </div>
  `;

  // Auto hide after 5 seconds
  setTimeout(() => {
    messageBox.innerHTML = "";
  }, 5000);
}

// Handle Login
async function handleLogin(event) {
  event.preventDefault();

  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const btnText = document.querySelector(".btn-text");
  const btnLoader = document.querySelector(".btn-loader");

  // Show loading
  btnText.style.display = "none";
  btnLoader.style.display = "inline";

  try {
    const response = await fetch("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      // Save token and user data
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      showMessage("Login successful! Redirecting...", "success");

      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    } else {
      showMessage(data.error || "Login failed");
    }
  } catch (error) {
    showMessage("Network error. Please check your connection.");
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
  }
}

// Handle Registration
async function handleRegister(event) {
  event.preventDefault();

  const fullName = document.getElementById("fullName").value;
  const email = document.getElementById("email").value;
  const phone = document.getElementById("phone").value;
  const grade = document.getElementById("grade").value;
  const institution = document.getElementById("institution").value;
  const password = document.getElementById("password").value;
  const confirmPassword = document.getElementById("confirmPassword").value;

  // Validate passwords match
  if (password !== confirmPassword) {
    showMessage("Passwords do not match!");
    return;
  }

  const btnText = document.querySelector(".btn-text");
  const btnLoader = document.querySelector(".btn-loader");

  btnText.style.display = "none";
  btnLoader.style.display = "inline";

  try {
    const response = await fetch("http://localhost:3000/api/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fullName,
        email,
        password,
        phone,
        grade,
        institution,
      }),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      showMessage("Registration successful! Redirecting...", "success");

      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
    } else {
      showMessage(data.error || "Registration failed");
    }
  } catch (error) {
    showMessage("Network error. Please try again.");
  } finally {
    btnText.style.display = "inline";
    btnLoader.style.display = "none";
  }
}

// Logout function
function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  window.location.href = "/login";
}

// Get current user
function getCurrentUser() {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
}

// Get auth headers for API calls
function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// Initialize auth on page load
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();

  // Attach form handlers
  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", handleLogin);
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", handleRegister);
  }

  // Setup logout buttons
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", (e) => {
      e.preventDefault();
      logout();
    });
  }
});
