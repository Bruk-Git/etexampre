// backend/server.js
const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { initializeDatabase } = require("./database");
const authRoutes = require("./routes/auth");
const examRoutes = require("./routes/exams");
const paperRoutes = require("./routes/papers");
const uploadRoutes = require("./routes/upload");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Serve frontend files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/papers", paperRoutes);
app.use("/api/upload", uploadRoutes);

// Frontend routes
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

app.get("/exams", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontend", "exams.html"));
});

// Initialize database and start server
initializeDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
});
