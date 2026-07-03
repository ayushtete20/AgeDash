/**
 * server.js — Booking & Static Server  (Port 3000)
 * Handles: static file serving, booking CRUD, LinkedIn scraper webhook forwarder.
 * Auth and MariaDB are handled by server_mariadb.js on Port 3001.
 */

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const https   = require('https');
const getHttpsOptions = require('./generate_cert');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── File-based bookings datastore ─────────────────────────────────────────
const BOOKINGS_FILE = path.join(__dirname, 'bookings.json');
if (!fs.existsSync(BOOKINGS_FILE)) fs.writeFileSync(BOOKINGS_FILE, '[]');

function readBookings() {
  try { return JSON.parse(fs.readFileSync(BOOKINGS_FILE, 'utf8') || '[]'); }
  catch { return []; }
}
function writeBookings(bookings) {
  try { fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2)); return true; }
  catch { return false; }
}

// ── Middleware ─────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));   // serves all .html files

// ── Pages ──────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, '../frontend', 'agedash_orange_accent.html')));
app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, '../frontend', 'login_page.html')));
app.get('/user-dashboard', (_req, res) => res.sendFile(path.join(__dirname, '../frontend', 'user_dashboard.html')));
app.get('/owner-dashboard', (_req, res) => res.sendFile(path.join(__dirname, '../frontend', 'owner_dashboard.html')));

// ── Booking Routes ─────────────────────────────────────────────────────────

// POST /api/book
app.post('/api/book', (req, res) => {
  const { name, email, date, start_time, end_time } = req.body;

  if (!name || !email || !date || !start_time || !end_time)
    return res.status(400).json({ message: 'All fields are required.' });

  if (start_time < '11:00' || start_time > '23:00' || end_time < '11:00' || end_time > '23:00')
    return res.status(400).json({ message: 'Booking time must be between 11:00 AM and 11:00 PM.' });

  if (start_time >= end_time)
    return res.status(400).json({ message: 'Start time must be before end time.' });

  const bookings = readBookings();
  const conflict = bookings.find(b =>
    b.date === date && (start_time < b.end_time && end_time > b.start_time)
  );
  if (conflict)
    return res.status(409).json({
      message: `Conflict on ${date} with booking ${conflict.start_time}–${conflict.end_time}.`
    });

  const newBooking = { id: 'BK-' + Date.now(), name, email, date, start_time, end_time, status: 'Confirmed', created_at: new Date().toISOString() };
  bookings.push(newBooking);
  writeBookings(bookings)
    ? res.status(200).json({ message: 'Booking confirmed!', booking: newBooking })
    : res.status(500).json({ message: 'Failed to save booking.' });
});

// GET /api/bookings
app.get('/api/bookings', (_req, res) => {
  const bookings = readBookings();
  // Migrate old bookings to have id and status
  let modified = false;
  bookings.forEach((b, i) => {
    if (!b.id) { b.id = 'BK-' + (Date.now() + i); modified = true; }
    if (!b.status) { b.status = 'Confirmed'; modified = true; }
  });
  if (modified) writeBookings(bookings);
  res.json(bookings);
});

// PUT /api/bookings/:id/cancel
app.put('/api/bookings/:id/cancel', (req, res) => {
  const bookings = readBookings();
  const booking = bookings.find(b => b.id === req.params.id);
  if (!booking) return res.status(404).json({ message: 'Booking not found.' });
  
  booking.status = 'Cancelled';
  if (writeBookings(bookings)) {
    res.json({ message: 'Booking cancelled.', booking });
  } else {
    res.status(500).json({ message: 'Failed to update booking.' });
  }
});

// ── LinkedIn Scraper Webhook Forwarder ─────────────────────────────────────
const LINKEDIN_WEBHOOK_URL = process.env.LINKEDIN_WEBHOOK_URL || 'https://hooks.example.com/placeholder';

app.post('/api/scrape/linkedin', async (req, res) => {
  const { query, limit, jobDescriptionName } = req.body;
  if (!query) return res.status(400).json({ message: 'Search query is required.' });
  try {
    if (LINKEDIN_WEBHOOK_URL.startsWith('http')) {
      await fetch(LINKEDIN_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'linkedin_search_trigger',
          timestamp: new Date().toISOString(),
          query, limit: limit || 10,
          job_description_file: jobDescriptionName || null
        })
      });
    }
    res.status(200).json({ message: 'Scraper task triggered.' });
  } catch (error) {
    res.status(202).json({ message: 'Scraper initialized; webhook dispatch failed.', error: error.message });
  }
});

// ── Start ──────────────────────────────────────────────────────────────────
getHttpsOptions().then(options => {
  https.createServer(options, app).listen(PORT, () => {
    console.log(`📦 Booking Server running on https://localhost:${PORT}`);
    console.log(`   Static files served from: ${__dirname}`);
    console.log(`   MariaDB / Auth Server:     https://localhost:3001  (run server_mariadb.js)`);
  });
}).catch(err => {
  console.error('Failed to get HTTPS options:', err);
});
