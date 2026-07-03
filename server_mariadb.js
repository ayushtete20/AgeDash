/**
 * server_mariadb.js — Auth & MariaDB Server  (Port 3001)
 * Handles: JWT login, token verification, user management, search query tracking, owner analytics, and PDF uploads.
 * Booking routes stay in server.js on Port 3000.
 *
 * Start: node server_mariadb.js
 * Requires: .env file with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, JWT_SECRET
 */

require('dotenv').config();
const express    = require('express');
const https      = require('https');
const getHttpsOptions = require('./generate_cert');
const cors       = require('cors');
const mariadb    = require('mariadb');
const jwt        = require('jsonwebtoken');
const bcrypt     = require('bcryptjs');
const multer     = require('multer');
const path       = require('path');
const fs         = require('fs');
const nodemailer = require('nodemailer');

// ── Email Notification Transporter ────────────────────────────────────────
const { sendOTPEmail } = require('./utils/emailService');
let mailTransporter = null;
let emailEnabled = false;
let OTP_ENABLED = false; // Added OTP toggle setting

function initMailer() {
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpUser || !smtpPass || smtpUser === 'your_email@gmail.com') {
    console.log('📧 Email notifications: DISABLED (fill SMTP_USER & SMTP_PASS in .env)');
    return;
  }
  const smtpPort = parseInt(process.env.SMTP_PORT || '587');
  mailTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: smtpPort,
    secure: smtpPort === 465,   // SSL/TLS for 465, STARTTLS for 587
    auth: { user: smtpUser, pass: smtpPass },
  });
  emailEnabled = true;
  console.log(`📧 Email notifications: ENABLED → ${process.env.NOTIFY_TO || 'devp2903@gmail.com,ayushtete20@gmail.com'}`);
}

async function notifyOwners({ userEmail, searchQuery, details, pdfFilename, queryId }) {
  if (!emailEnabled || !mailTransporter) return;
  const recipients = process.env.NOTIFY_TO || 'devp2903@gmail.com,ayushtete20@gmail.com';
  const from       = process.env.NOTIFY_FROM || `AgeDash Alerts <${process.env.SMTP_USER}>`;
  const timestamp  = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const htmlBody = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #FF9B51, #f97316); padding: 20px 24px; color: #fff;">
        <h2 style="margin: 0; font-size: 18px;">🔔 New LinkedIn Search Query</h2>
        <p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">AgeDash Dashboard Alert — ${timestamp}</p>
      </div>
      <div style="padding: 24px; background: #fff;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #6b7280; width: 120px;">Query ID</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b;">#${queryId}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">User</td><td style="padding: 8px 0; font-weight: 600; color: #1e293b;">${userEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Search Query</td><td style="padding: 8px 0; font-weight: 600; color: #f97316;">${searchQuery}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">Details</td><td style="padding: 8px 0; color: #1e293b;">${details || '—'}</td></tr>
          <tr><td style="padding: 8px 0; color: #6b7280;">PDF Attached</td><td style="padding: 8px 0; color: #1e293b;">${pdfFilename || 'None'}</td></tr>
        </table>
      </div>
      <div style="background: #f9fafb; padding: 14px 24px; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 12px; color: #94a3b8;">AgeDash Owner Panel — <a href="http://localhost:3000/owner-dashboard" style="color: #f97316;">Open Dashboard</a></p>
      </div>
    </div>
  `;

  try {
    await mailTransporter.sendMail({
      from,
      to: recipients,
      subject: `🔔 New Search: "${searchQuery}" by ${userEmail}`,
      html: htmlBody,
    });
    console.log(`📧 Notification sent to ${recipients} for query #${queryId}`);
  } catch (err) {
    console.error('📧 Email send error:', err.message);
  }
}

const app  = express();
const PORT = process.env.DB_API_PORT || 3001;

// ── Upload Destination Config ─────────────────────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'match_criteria_' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ── Hardcoded Owner / Admin accounts (prototype phase) ────────────────────
const OWNER_ACCOUNTS = [
  { email: 'devp2903@gmail.com',    password: 'admin@2506' },
  { email: 'ayushtete20@gmail.com', password: 'admin@2506' },
];

// ── CORS — allow requests from the booking server (port 3000) ─────────────
app.use(cors({
  origin: ['https://localhost:3000', 'https://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// ── MariaDB Connection Pool ───────────────────────────────────────────────
let pool = null;
let dbConnected = false;

async function initDB() {
  try {
    pool = mariadb.createPool({
      host:            process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT   || '3306'),
      database:        process.env.DB_NAME     || 'agedash',
      user:            process.env.DB_USER     || 'root',
      password:        process.env.DB_PASSWORD || '',
      connectionLimit: 5,
      connectTimeout:  10000,
    });

    const conn = await pool.getConnection();

    // ── search_queries table ──────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS search_queries (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        user_email   VARCHAR(255) NOT NULL,
        search_query TEXT         NOT NULL,
        details      TEXT,
        pdf_filename VARCHAR(255) NULL,
        pdf_path     VARCHAR(255) NULL,
        timestamp    DATETIME     DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure google_sheet_url column exists in users table (migration)
    try {
      await conn.query(`ALTER TABLE users ADD COLUMN google_sheet_url VARCHAR(1024) DEFAULT NULL`);
    } catch (e) {
      if (e.code !== 'ER_DUP_FIELDNAME') {
        console.error('Error adding google_sheet_url column:', e.message);
      }
    }
    try { await conn.query('ALTER TABLE search_queries ADD COLUMN pdf_filename VARCHAR(255) NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE search_queries ADD COLUMN pdf_path VARCHAR(255) NULL'); } catch (_) {}

    // ── users table ───────────────────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        profile_name  VARCHAR(100) DEFAULT NULL,
        role          ENUM('user','owner') DEFAULT 'user',
        is_verified   BOOLEAN DEFAULT FALSE,
        google_sheet_url VARCHAR(1024) DEFAULT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // ── Seed default accounts if they don't exist ─────────────────────
    const SEED_ACCOUNTS = [
      { email: 'devp2903@gmail.com',    password: 'admin@2506', role: 'owner', name: 'Dev Patel' },
      { email: 'ayushtete20@gmail.com', password: 'admin@2506', role: 'owner', name: 'Ayush Tete' },
      { email: 'client@agedash.io',     password: 'user123',    role: 'user',  name: 'Demo User' },
    ];
    for (const acct of SEED_ACCOUNTS) {
      const exists = await conn.query('SELECT id FROM users WHERE email = ?', [acct.email]);
      if (exists.length === 0) {
        const hash = await bcrypt.hash(acct.password, 10);
        await conn.query(
          'INSERT INTO users (email, password_hash, profile_name, role, is_verified) VALUES (?, ?, ?, ?, ?)',
          [acct.email, hash, acct.name, acct.role, true]
        );
        console.log(`   👤 Seeded ${acct.role}: ${acct.email}`);
      }
    }

    conn.release();
    dbConnected = true;
    console.log('✅ MariaDB connected — search_queries + users tables ready.');
  } catch (err) {
    console.warn(`⚠️  MariaDB connection failed: ${err.message}`);
    console.warn('   Auth routes will still work (hardcoded fallback). Tracking/analytics routes return 503.');
    dbConnected = false;
  }
}

// ── JWT Middleware ─────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'agedash_dev_secret';

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Access denied. No token provided.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(403).json({ message: 'Invalid or expired token. Please log in again.' });
  }
}

function requireOwner(req, res, next) {
  if (req.user?.role === 'owner') return next();
  return res.status(403).json({ message: 'Access restricted to owner accounts.' });
}

// ── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'MariaDB/Auth', port: PORT, dbConnected });
});

// ── Settings Routes ──────────────────────────────────────────────────────────

app.get('/api/settings', authenticateToken, requireOwner, (req, res) => {
  res.json({ otpEnabled: OTP_ENABLED });
});

app.post('/api/settings', authenticateToken, requireOwner, (req, res) => {
  const { otpEnabled } = req.body;
  if (typeof otpEnabled === 'boolean') {
    OTP_ENABLED = otpEnabled;
    res.json({ message: 'Settings updated successfully', otpEnabled: OTP_ENABLED });
  } else {
    res.status(400).json({ message: 'Invalid settings' });
  }
});

// ── Auth Routes ────────────────────────────────────────────────────────────

const otpStore = {}; // Temporary memory store for OTPs

async function handleLoginSuccess(res, userData) {
  if (OTP_ENABLED) {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[userData.email.toLowerCase()] = { otp, userData, expiresAt: Date.now() + 10 * 60 * 1000 };
    try {
      await sendOTPEmail(userData.email, otp);
      return res.json({ requireOtp: true, email: userData.email, message: 'OTP sent to your email.' });
    } catch (err) {
      console.error('Failed to send OTP:', err);
      return res.status(500).json({ message: 'Failed to send OTP email.' });
    }
  }

  // If OTP is not enabled, directly return the token
  const tokenPayload = {
    email: userData.email,
    role: userData.role
  };
  if (userData.id) tokenPayload.id = Number(userData.id);
  if (userData.profile_name) tokenPayload.profile_name = userData.profile_name;
  
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
  return res.json({
    token,
    role: userData.role,
    redirect: userData.role === 'owner' ? '/owner-dashboard' : '/user-dashboard',
    email: userData.email,
    profile_name: userData.profile_name || null,
    is_verified: !!userData.is_verified,
    google_sheet_url: userData.google_sheet_url || null
  });
}

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: 'Email and password are required.' });

  // ── Try DB-backed authentication first ──────────────────────────────
  if (dbConnected && pool) {
    let conn;
    try {
      conn = await pool.getConnection();
      const rows = await conn.query(
        'SELECT id, email, password_hash, profile_name, role, is_verified, google_sheet_url FROM users WHERE email = ?',
        [email.toLowerCase()]
      );
      if (rows.length > 0) {
        const user = rows[0];
        const match = await bcrypt.compare(password, user.password_hash);
        if (match) {
          return await handleLoginSuccess(res, user);
        }
        return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
      }
      // User not found in DB — fall through to hardcoded fallback
    } catch (err) {
      console.error('DB login error, falling back to hardcoded:', err.message);
    } finally {
      if (conn) conn.release();
    }
  }

  // ── Hardcoded fallback (DB offline or user not in DB) ───────────────
  const ownerMatch = OWNER_ACCOUNTS.find(
    a => a.email.toLowerCase() === email.toLowerCase() && a.password === password
  );
  if (ownerMatch) {
    return await handleLoginSuccess(res, { email: ownerMatch.email, role: 'owner' });
  }
  if (password === 'user123') {
    return await handleLoginSuccess(res, { email: email.toLowerCase(), role: 'user' });
  }

  return res.status(401).json({ message: 'Invalid credentials. Please check your email and password.' });
});

// POST /api/auth/verify-otp
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Email and OTP are required.' });

  const emailLower = email.toLowerCase();
  const stored = otpStore[emailLower];
  
  if (!stored) return res.status(400).json({ message: 'No pending OTP found or OTP expired.' });
  if (Date.now() > stored.expiresAt) {
    delete otpStore[emailLower];
    return res.status(400).json({ message: 'OTP has expired. Please log in again.' });
  }
  
  if (stored.otp !== String(otp)) {
    return res.status(400).json({ message: 'Invalid OTP.' });
  }

  // OTP is correct
  const userData = stored.userData;
  delete otpStore[emailLower];

  const tokenPayload = { email: userData.email, role: userData.role };
  if (userData.id) tokenPayload.id = Number(userData.id);
  if (userData.profile_name) tokenPayload.profile_name = userData.profile_name;
  
  const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });
  return res.json({
    token,
    role: userData.role,
    redirect: userData.role === 'owner' ? '/owner-dashboard' : '/user-dashboard',
    email: userData.email,
    profile_name: userData.profile_name || null,
    is_verified: !!userData.is_verified,
    google_sheet_url: userData.google_sheet_url || null
  });
});


// POST /api/auth/verify — lightweight token health check
app.post('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ── DB Status ──────────────────────────────────────────────────────────────
app.get('/api/db/status', (_req, res) => {
  res.json({ connected: dbConnected });
});

// ── Query Tracking Routes ──────────────────────────────────────────────────

// POST /api/queries/track  (requires user or owner JWT; supports multipart/form-data upload)
app.post('/api/queries/track', authenticateToken, upload.single('pdf'), async (req, res) => {
  if (!dbConnected)
    return res.status(503).json({ message: 'Database not connected. Query not persisted.' });

  const { search_query, details } = req.body;
  if (!search_query)
    return res.status(400).json({ message: 'search_query is required.' });

  const pdfFilename = req.file ? req.file.originalname : null;
  const pdfPath = req.file ? `/uploads/${req.file.filename}` : null;

  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO search_queries (user_email, search_query, details, pdf_filename, pdf_path) VALUES (?, ?, ?, ?, ?)',
      [req.user.email, search_query, details || null, pdfFilename, pdfPath]
    );
    const insertedId = Number(result.insertId);
    res.json({ message: 'Query tracked successfully.', id: insertedId, pdf_path: pdfPath });

    // Fire email notification (non-blocking — don't await)
    notifyOwners({
      userEmail:   req.user.email,
      searchQuery: search_query,
      details:     details || null,
      pdfFilename: pdfFilename,
      queryId:     insertedId,
    });
  } catch (err) {
    console.error('DB insert error:', err.message);
    res.status(500).json({ message: 'Failed to save query to database.' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/queries  (owner-only)
app.get('/api/queries', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected)
    return res.status(503).json({ message: 'Database not connected.' });

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, user_email, search_query, details, pdf_filename, pdf_path, timestamp FROM search_queries ORDER BY timestamp DESC'
    );
    const safe = rows.map(r => ({
      id:           Number(r.id),
      user_email:   r.user_email,
      search_query: r.search_query,
      details:      r.details,
      pdf_filename: r.pdf_filename,
      pdf_path:     r.pdf_path,
      timestamp:    r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    }));
    res.json(safe);
  } catch (err) {
    console.error('DB query error:', err.message);
    res.status(500).json({ message: 'Failed to retrieve queries from database.' });
  } finally {
    if (conn) conn.release();
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ── ADMIN USER MANAGEMENT ROUTES (owner-only) ─────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

// GET /api/admin/users — list all users
app.get('/api/admin/users', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, email, profile_name, role, is_verified, google_sheet_url, created_at, updated_at FROM users ORDER BY created_at DESC'
    );
    const safe = rows.map(r => ({
      id:           Number(r.id),
      email:        r.email,
      profile_name: r.profile_name,
      role:         r.role,
      is_verified:  !!r.is_verified,
      google_sheet_url: r.google_sheet_url,
      created_at:   r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
      updated_at:   r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at,
    }));
    res.json(safe);
  } catch (err) {
    console.error('Admin list users error:', err.message);
    res.status(500).json({ message: 'Failed to retrieve users.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/admin/users/:id/profile - admin update profile
app.put('/api/admin/users/:id/profile', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { profile_name, google_sheet_url } = req.body;
  if (profile_name === undefined && google_sheet_url === undefined) {
    return res.status(400).json({ message: 'No fields to update provided.' });
  }
  let conn;
  try {
    conn = await pool.getConnection();
    const updates = [];
    const params = [];
    if (profile_name !== undefined) {
      updates.push('profile_name = ?');
      params.push(profile_name || null);
    }
    if (google_sheet_url !== undefined) {
      updates.push('google_sheet_url = ?');
      params.push(google_sheet_url || null);
    }
    params.push(req.params.id);
    await conn.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ message: 'Profile updated.' });
  } catch (err) {
    console.error('Admin update profile error:', err.message);
    res.status(500).json({ message: 'Failed to update profile.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/admin/users/:id/password — admin reset password
app.put('/api/admin/users/:id/password', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { new_password } = req.body;
  if (!new_password || new_password.length < 4)
    return res.status(400).json({ message: 'new_password is required (min 4 characters).' });
  let conn;
  try {
    conn = await pool.getConnection();
    const hash = await bcrypt.hash(new_password, 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    res.json({ message: 'Password updated successfully.' });
  } catch (err) {
    console.error('Admin reset password error:', err.message);
    res.status(500).json({ message: 'Failed to update password.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/admin/users/:id/verify — admin toggle verification status
app.put('/api/admin/users/:id/verify', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { is_verified } = req.body;
  if (is_verified === undefined) return res.status(400).json({ message: 'is_verified is required.' });
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('UPDATE users SET is_verified = ? WHERE id = ?', [is_verified ? 1 : 0, req.params.id]);
    res.json({ message: `User ${is_verified ? 'verified' : 'unverified'}.` });
  } catch (err) {
    console.error('Admin toggle verify error:', err.message);
    res.status(500).json({ message: 'Failed to update verification status.' });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/admin/users — admin create a new user
app.post('/api/admin/users', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { email, password, profile_name, role } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Email and password are required.' });
  if (password.length < 4) return res.status(400).json({ message: 'Password must be at least 4 characters.' });
  
  let conn;
  try {
    conn = await pool.getConnection();
    // Check if user exists
    const rows = await conn.query('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (rows.length > 0) return res.status(409).json({ message: 'User with this email already exists.' });
    
    const hash = await bcrypt.hash(password, 10);
    const result = await conn.query(
      'INSERT INTO users (email, password_hash, profile_name, role, is_verified) VALUES (?, ?, ?, ?, ?)',
      [email.toLowerCase(), hash, profile_name || null, role === 'owner' ? 'owner' : 'user', 1]
    );
    res.status(201).json({ message: 'User created successfully.', id: Number(result.insertId) });
  } catch (err) {
    console.error('Admin create user error:', err.message);
    res.status(500).json({ message: 'Failed to create user.' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE /api/admin/users/:id — admin delete user
app.delete('/api/admin/users/:id', authenticateToken, requireOwner, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  let conn;
  try {
    conn = await pool.getConnection();
    // Prevent an owner from deleting themselves (using req.user.email)
    const targetRows = await conn.query('SELECT email FROM users WHERE id = ?', [req.params.id]);
    if (targetRows.length > 0 && targetRows[0].email.toLowerCase() === req.user.email.toLowerCase()) {
      return res.status(403).json({ message: 'You cannot delete your own account.' });
    }

    const result = await conn.query('DELETE FROM users WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: 'User not found.' });
    res.json({ message: 'User deleted successfully.' });
  } catch (err) {
    console.error('Admin delete user error:', err.message);
    res.status(500).json({ message: 'Failed to delete user.' });
  } finally {
    if (conn) conn.release();
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ── USER SELF-SERVICE PROFILE ROUTES ──────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════

// GET /api/profile/queries — get own search queries
app.get('/api/profile/queries', authenticateToken, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, search_query, details, pdf_filename, pdf_path, timestamp FROM search_queries WHERE user_email = ? ORDER BY timestamp DESC',
      [req.user.email]
    );
    const safe = rows.map(r => ({
      id:           Number(r.id),
      search_query: r.search_query,
      details:      r.details,
      pdf_filename: r.pdf_filename,
      pdf_path:     r.pdf_path,
      timestamp:    r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
    }));
    res.json(safe);
  } catch (err) {
    console.error('Get profile queries error:', err.message);
    res.status(500).json({ message: 'Failed to load queries.' });
  } finally {
    if (conn) conn.release();
  }
});

// GET /api/profile — get own profile
app.get('/api/profile', authenticateToken, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, email, profile_name, role, is_verified, google_sheet_url, created_at FROM users WHERE email = ?',
      [req.user.email]
    );
    if (rows.length === 0) return res.status(404).json({ message: 'User not found in database.' });
    const u = rows[0];
    res.json({
      id:           Number(u.id),
      email:        u.email,
      profile_name: u.profile_name,
      role:         u.role,
      is_verified:  !!u.is_verified,
      google_sheet_url: u.google_sheet_url || null,
      created_at:   u.created_at instanceof Date ? u.created_at.toISOString() : u.created_at,
    });
  } catch (err) {
    console.error('Get profile error:', err.message);
    res.status(500).json({ message: 'Failed to load profile.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/profile/name — update own profile name
app.put('/api/profile/name', authenticateToken, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { profile_name } = req.body;
  if (profile_name === undefined) return res.status(400).json({ message: 'profile_name is required.' });
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('UPDATE users SET profile_name = ? WHERE email = ?', [profile_name || null, req.user.email]);
    res.json({ message: 'Display name updated.', profile_name });
  } catch (err) {
    console.error('Update name error:', err.message);
    res.status(500).json({ message: 'Failed to update display name.' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT /api/profile/password — change own password (requires current password)
app.put('/api/profile/password', authenticateToken, async (req, res) => {
  if (!dbConnected) return res.status(503).json({ message: 'Database not connected.' });
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password)
    return res.status(400).json({ message: 'Both current_password and new_password are required.' });
  if (new_password.length < 4)
    return res.status(400).json({ message: 'New password must be at least 4 characters.' });
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT password_hash FROM users WHERE email = ?', [req.user.email]);
    if (rows.length === 0) return res.status(404).json({ message: 'User not found.' });
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(401).json({ message: 'Current password is incorrect.' });
    const hash = await bcrypt.hash(new_password, 10);
    await conn.query('UPDATE users SET password_hash = ? WHERE email = ?', [hash, req.user.email]);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ message: 'Failed to change password.' });
  } finally {
    if (conn) conn.release();
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
initDB().then(() => {
  initMailer();
  return getHttpsOptions();
}).then(options => {
  https.createServer(options, app).listen(PORT, () => {
    console.log(`🗄️  MariaDB/Auth Server running on https://localhost:${PORT}`);
    console.log(`   DB status:  ${dbConnected ? '✅ Connected' : '⚠️  Not connected (fill in .env)'}`);
    console.log(`   Booking Server should be running on https://localhost:3000  (node server.js)`);
  });
}).catch(err => {
  console.error('Startup error:', err);
});
