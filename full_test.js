/**
 * full_test.js — Comprehensive End-to-End Test Suite
 * Tests: Health checks, DB status, Login (owner + user), Query tracking, Owner query retrieval
 */

const http = require('http');
const https = require('https');

const BOOKING_API = 'https://localhost:3000';
const DB_API      = 'https://localhost:3001';

let passCount = 0;
let failCount = 0;
const results = [];

function log(status, testName, detail) {
  const icon = status === 'PASS' ? '✅' : '❌';
  if (status === 'PASS') passCount++;
  else failCount++;
  const msg = `${icon} [${status}] ${testName}: ${detail}`;
  console.log(msg);
  results.push({ status, testName, detail });
}

function httpRequest(url, options = {}) {
  return new Promise(function(resolve, reject) {
    const lib = url.startsWith('https') ? https : http;
    const method = (options.method || 'GET').toUpperCase();

    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: method,
      headers: options.headers || {},
    };

    const req = lib.request(reqOptions, function(res) {
      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        let parsed;
        try { parsed = JSON.parse(data); } catch(e) { parsed = data; }
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });

    req.on('error', function(err) { reject(err); });
    req.setTimeout(10000, function() { req.destroy(); reject(new Error('Timeout')); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('\n' + '═'.repeat(70));
  console.log('  AgeDash Full System Test Suite');
  console.log('  ' + new Date().toLocaleString('en-IN'));
  console.log('═'.repeat(70) + '\n');

  // ─── TEST 1: Booking Server Health ─────────────────────────────────────
  try {
    const r = await httpRequest(DB_API + '/health');
    if (r.status === 200 && r.data.status === 'ok') {
      log('PASS', 'DB Server Health', 'Server responding on port 3001');
    } else {
      log('FAIL', 'DB Server Health', 'Unexpected response: ' + r.raw);
    }
  } catch (e) {
    log('FAIL', 'DB Server Health', 'Cannot reach port 3001: ' + e.message);
  }

  // ─── TEST 2: MariaDB Connection ────────────────────────────────────────
  try {
    const r = await httpRequest(DB_API + '/api/db/status');
    if (r.status === 200 && r.data.connected === true) {
      log('PASS', 'MariaDB Connection', 'Database connected and responding');
    } else {
      log('FAIL', 'MariaDB Connection', 'DB not connected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'MariaDB Connection', e.message);
  }

  // ─── TEST 3: Owner Login ───────────────────────────────────────────────
  let ownerToken = null;
  try {
    const r = await httpRequest(DB_API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'devp2903@gmail.com', password: 'admin@2506' })
    });
    if (r.status === 200 && r.data.token && r.data.role === 'owner') {
      ownerToken = r.data.token;
      log('PASS', 'Owner Login', 'JWT issued, role=owner, redirect=' + r.data.redirect);
    } else {
      log('FAIL', 'Owner Login', 'Unexpected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'Owner Login', e.message);
  }

  // ─── TEST 4: User Login ────────────────────────────────────────────────
  let userToken = null;
  try {
    const r = await httpRequest(DB_API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testuser@agedash.io', password: 'user123' })
    });
    if (r.status === 200 && r.data.token && r.data.role === 'user') {
      userToken = r.data.token;
      log('PASS', 'User Login', 'JWT issued, role=user, redirect=' + r.data.redirect);
    } else {
      log('FAIL', 'User Login', 'Unexpected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'User Login', e.message);
  }

  // ─── TEST 5: Invalid Login Rejected ────────────────────────────────────
  try {
    const r = await httpRequest(DB_API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'hacker@bad.com', password: 'wrongpassword' })
    });
    if (r.status === 401) {
      log('PASS', 'Invalid Login Rejected', 'Correctly returned 401');
    } else {
      log('FAIL', 'Invalid Login Rejected', 'Expected 401 but got ' + r.status);
    }
  } catch (e) {
    log('FAIL', 'Invalid Login Rejected', e.message);
  }

  // ─── TEST 6: Token Verification ────────────────────────────────────────
  try {
    const r = await httpRequest(DB_API + '/api/auth/verify', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + ownerToken, 'Content-Type': 'application/json' },
    });
    if (r.status === 200 && r.data.valid === true) {
      log('PASS', 'Token Verification', 'Owner token verified successfully');
    } else {
      log('FAIL', 'Token Verification', 'Unexpected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'Token Verification', e.message);
  }

  // ─── TEST 7: Track a Search Query (DB Write) ──────────────────────────
  let trackedId = null;
  try {
    const r = await httpRequest(DB_API + '/api/queries/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + userToken },
      body: JSON.stringify({
        search_query: 'Full-Stack Developer in Mumbai',
        details: 'Limit: 10 | Test run from full_test.js'
      })
    });
    if (r.status === 200 && r.data.id) {
      trackedId = r.data.id;
      log('PASS', 'Query Track (DB Write)', 'Query saved to MariaDB with ID #' + trackedId);
    } else {
      log('FAIL', 'Query Track (DB Write)', 'Unexpected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'Query Track (DB Write)', e.message);
  }

  // ─── TEST 8: Owner Can Fetch Queries (DB Read) ────────────────────────
  try {
    const r = await httpRequest(DB_API + '/api/queries', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + ownerToken },
    });
    if (r.status === 200 && Array.isArray(r.data)) {
      const found = r.data.find(function(q) { return q.id === trackedId; });
      if (found) {
        log('PASS', 'Owner Query Fetch (DB Read)', 'Found tracked query #' + trackedId + ' in ' + r.data.length + ' total rows');
      } else {
        log('FAIL', 'Owner Query Fetch (DB Read)', 'Query #' + trackedId + ' not found in results');
      }
    } else {
      log('FAIL', 'Owner Query Fetch (DB Read)', 'Unexpected: ' + JSON.stringify(r.data));
    }
  } catch (e) {
    log('FAIL', 'Owner Query Fetch (DB Read)', e.message);
  }

  // ─── TEST 9: User Cannot Access Owner Routes ──────────────────────────
  try {
    const r = await httpRequest(DB_API + '/api/queries', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer ' + userToken },
    });
    if (r.status === 403) {
      log('PASS', 'User Blocked from Owner Route', 'Correctly returned 403 Forbidden');
    } else {
      log('FAIL', 'User Blocked from Owner Route', 'Expected 403 but got ' + r.status);
    }
  } catch (e) {
    log('FAIL', 'User Blocked from Owner Route', e.message);
  }

  // ─── TEST 10: Booking Server Static Files ──────────────────────────────
  try {
    const r = await httpRequest(BOOKING_API + '/login_page.html');
    if (r.status === 200 && r.raw.includes('AgeDash')) {
      log('PASS', 'Static File Serving', 'login_page.html served successfully from port 3000');
    } else {
      log('FAIL', 'Static File Serving', 'login_page.html not served correctly, status=' + r.status);
    }
  } catch (e) {
    log('FAIL', 'Static File Serving', e.message);
  }

  // ─── TEST 11: Landing Page Loads ───────────────────────────────────────
  try {
    const r = await httpRequest(BOOKING_API + '/agedash_orange_accent.html');
    if (r.status === 200 && r.raw.includes('AgeDash')) {
      log('PASS', 'Landing Page', 'agedash_orange_accent.html loads (size: ' + Math.round(r.raw.length/1024) + 'KB)');
    } else {
      log('FAIL', 'Landing Page', 'Failed to load, status=' + r.status);
    }
  } catch (e) {
    log('FAIL', 'Landing Page', e.message);
  }

  // ─── TEST 12: User Dashboard Loads ─────────────────────────────────────
  try {
    const r = await httpRequest(BOOKING_API + '/user_dashboard.html');
    if (r.status === 200 && r.raw.includes('DB_API')) {
      log('PASS', 'User Dashboard', 'user_dashboard.html loads and references DB_API');
    } else {
      log('FAIL', 'User Dashboard', 'Failed to load or missing DB_API reference');
    }
  } catch (e) {
    log('FAIL', 'User Dashboard', e.message);
  }

  // ─── TEST 13: Owner Dashboard Loads ────────────────────────────────────
  try {
    const r = await httpRequest(BOOKING_API + '/owner_dashboard.html');
    if (r.status === 200 && r.raw.includes('DB_API')) {
      log('PASS', 'Owner Dashboard', 'owner_dashboard.html loads and references DB_API');
    } else {
      log('FAIL', 'Owner Dashboard', 'Failed to load or missing DB_API reference');
    }
  } catch (e) {
    log('FAIL', 'Owner Dashboard', e.message);
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(70));
  console.log('  RESULTS:  ' + passCount + ' passed  |  ' + failCount + ' failed  |  ' + (passCount + failCount) + ' total');
  if (failCount === 0) {
    console.log('  🎉 ALL TESTS PASSED — System is fully operational!');
  } else {
    console.log('  ⚠️  ' + failCount + ' test(s) failed. Review above for details.');
  }
  console.log('═'.repeat(70) + '\n');
}

runTests().catch(function(err) { console.error('Test runner error:', err); });
