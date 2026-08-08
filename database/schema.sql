-- database/schema.sql

-- Users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    grade VARCHAR(50),           -- e.g., '12th', 'University'
    institution VARCHAR(200),    -- School or University name
    role VARCHAR(20) DEFAULT 'student',  -- 'student', 'admin'
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Exam types
CREATE TABLE exam_types (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    icon VARCHAR(10),
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Subjects
CREATE TABLE subjects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(100) NOT NULL,
    exam_type_id INTEGER REFERENCES exam_types(id) ON DELETE CASCADE,
    display_order INTEGER DEFAULT 0,
    UNIQUE(exam_type_id, slug)
);

-- Question papers (PDFs)
CREATE TABLE question_papers (
    id SERIAL PRIMARY KEY,
    title VARCHAR(300) NOT NULL,
    year INTEGER NOT NULL,
    exam_type_id INTEGER REFERENCES exam_types(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE CASCADE,
    file_path VARCHAR(500) NOT NULL,
    file_size VARCHAR(20),
    download_count INTEGER DEFAULT 0,
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Quiz attempts (for future use)
CREATE TABLE quiz_attempts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    exam_type_id INTEGER REFERENCES exam_types(id),
    subject_id INTEGER REFERENCES subjects(id),
    score DECIMAL(5,2),
    total_questions INTEGER,
    correct_answers INTEGER,
    time_taken INTEGER,           -- in seconds
    completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mock exam sessions (for future use)
CREATE TABLE mock_exam_sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    exam_type_id INTEGER REFERENCES exam_types(id),
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    score DECIMAL(5,2),
    status VARCHAR(20) DEFAULT 'in_progress',  -- 'in_progress', 'completed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User progress tracking
CREATE TABLE user_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    subject_id INTEGER REFERENCES subjects(id),
    papers_downloaded INTEGER DEFAULT 0,
    quizzes_taken INTEGER DEFAULT 0,
    average_score DECIMAL(5,2),
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, subject_id)
);

-- Indexes for performance
CREATE INDEX idx_papers_exam_subject ON question_papers(exam_type_id, subject_id);
CREATE INDEX idx_papers_year ON question_papers(year);
CREATE INDEX idx_quiz_user ON quiz_attempts(user_id);
CREATE INDEX idx_progress_user ON user_progress(user_id);