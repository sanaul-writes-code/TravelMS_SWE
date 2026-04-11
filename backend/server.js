const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('./db');

const app = express();
app.use(cors({
  origin: (origin, callback) => {
    const allowed = [
      'http://localhost:4200',
      'https://travel-ms-swe.vercel.app'
    ];
    if (!origin || allowed.includes(origin) || /^https:\/\/travel-ms-.*\.vercel\.app$/.test(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRONG_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getBearerToken(req) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim();
}

async function createSession(userId) {
  const sessionToken = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MS);

  await pool.query(
    `INSERT INTO Sessions (user_id, session_token, expires_at, is_active)
     VALUES (?, ?, ?, 1)`,
    [userId, sessionToken, expiresAt]
  );

  return { sessionToken, expiresAt };
}

async function requireAuth(req, res, next) {
  try {
    const sessionToken = getBearerToken(req);
    if (!sessionToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const [rows] = await pool.query(
      `SELECT s.session_id, s.user_id, s.expires_at, s.is_active,
              u.first_name, u.last_name, u.email, u.role, u.is_active AS user_is_active
       FROM Sessions s
       JOIN users u ON u.user_id = s.user_id
       WHERE s.session_token = ?
       LIMIT 1`,
      [sessionToken]
    );

    const session = rows[0];
    if (!session || !session.is_active) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    if (!session.user_is_active) {
      await pool.query('UPDATE Sessions SET is_active = 0 WHERE user_id = ?', [session.user_id]);
      return res.status(403).json({ error: 'Account is inactive' });
    }

    if (new Date(session.expires_at) < new Date()) {
      await pool.query('UPDATE Sessions SET is_active = 0 WHERE session_id = ?', [session.session_id]);
      return res.status(401).json({ error: 'Session expired' });
    }

    const nextExpiry = new Date(new Date().getTime() + SESSION_TIMEOUT_MS);
    await pool.query(
      'UPDATE Sessions SET expires_at = ? WHERE session_id = ?',
      [nextExpiry, session.session_id]
    );

    req.user = {
      session_id: session.session_id,
      user_id: session.user_id,
      first_name: session.first_name,
      last_name: session.last_name,
      email: session.email,
      role: session.role
    };

    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function getTripById(tripId) {
  const [rows] = await pool.query('SELECT * FROM trips WHERE trip_id = ? LIMIT 1', [tripId]);
  return rows[0] || null;
}

async function getExpenseById(expenseId) {
  const [rows] = await pool.query('SELECT * FROM expenses WHERE expense_id = ? LIMIT 1', [expenseId]);
  return rows[0] || null;
}

async function getItineraryById(itineraryId) {
  const [rows] = await pool.query('SELECT * FROM itineraries WHERE itinerary_id = ? LIMIT 1', [itineraryId]);
  return rows[0] || null;
}

async function isTripMember(tripId, userId) {
  const [rows] = await pool.query(
    'SELECT 1 FROM TripMembers WHERE trip_id = ? AND user_id = ? LIMIT 1',
    [tripId, userId]
  );
  return rows.length > 0;
}

function canAccessTrip(trip, userId, isAdmin) {
  return isAdmin || trip.user_id === userId;
}

async function canAccessTripOrMember(trip, userId, isAdmin) {
  if (canAccessTrip(trip, userId, isAdmin)) return true;
  return await isTripMember(trip.trip_id, userId);
}

function normalizeRole(role) {
  return role === 'Admin' ? 'Admin' : 'User';
}

function normalizeIsActive(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 1 || value === '1' ? 1 : 0;
}

function validateRegistrationInput({ first_name, last_name, email, password }) {
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !password) {
    return 'First name, last name, email, and password are required';
  }
  if (!EMAIL_REGEX.test(email)) {
    return 'Enter a valid email address';
  }
  if (!STRONG_PASSWORD_REGEX.test(password)) {
    return 'Password must be at least 8 characters and include uppercase, lowercase, and a number';
  }
  return null;
}

function validateUserUpdateInput({ first_name, last_name, email, password }) {
  if (!first_name?.trim() || !last_name?.trim() || !email?.trim()) {
    return 'First name, last name, and email are required';
  }
  if (!EMAIL_REGEX.test(email)) {
    return 'Enter a valid email address';
  }
  if (password && !STRONG_PASSWORD_REGEX.test(password)) {
    return 'Password must be at least 8 characters and include uppercase, lowercase, and a number';
  }
  return null;
}

function isValidTripStatus(status) {
  return ['Pending', 'Approved', 'Rejected', 'Completed'].includes(status);
}

function validateTripInput({ user_id, destination, start_date, end_date, estimated_budget }, isAdmin) {
  if (isAdmin && (!user_id || Number(user_id) <= 0)) {
    return 'Select a valid user';
  }
  if (!destination?.trim()) {
    return 'Destination is required';
  }
  if (!start_date || !end_date) {
    return 'Start date and end date are required';
  }
  if (new Date(start_date) > new Date(end_date)) {
    return 'Start date must be before or equal to end date';
  }
  if (estimated_budget !== undefined && estimated_budget !== null && Number(estimated_budget) < 0) {
    return 'Estimated budget must be 0 or greater';
  }
  return null;
}

function validateExpenseInput({ user_id, trip_id, category, amount, expense_date }, isAdmin) {
  if (isAdmin && (!user_id || Number(user_id) <= 0)) {
    return 'Select a valid user';
  }
  if (!trip_id) {
    return 'Trip is required';
  }
  if (!category?.trim()) {
    return 'Category is required';
  }
  if (amount === undefined || amount === null || amount === '' || Number(amount) <= 0) {
    return 'Amount must be greater than 0';
  }
  if (!expense_date) {
    return 'Expense date is required';
  }
  return null;
}

function validateItineraryInput({ trip_id, activity_name, activity_date }) {
  if (!trip_id || Number(trip_id) <= 0) {
    return 'Trip is required';
  }
  if (!activity_name?.trim()) {
    return 'Activity name is required';
  }
  if (!activity_date) {
    return 'Activity date is required';
  }
  return null;
}

async function logUserManagementAction(adminId, targetUserId, actionType, oldValue, newValue) {
  await pool.query(
    `INSERT INTO UserManagementLogs (admin_id, target_user_id, action_type, old_value, new_value)
     VALUES (?, ?, ?, ?, ?)`,
    [adminId, targetUserId, actionType, oldValue, newValue]
  );
}

async function deactivateSessionsForUser(userId) {
  await pool.query('UPDATE Sessions SET is_active = 0 WHERE user_id = ?', [userId]);
}

async function createNotification(userId, tripId, type, message) {
  await pool.query(
    `INSERT INTO notifications (user_id, trip_id, message, notification_type)
     VALUES (?, ?, ?, ?)`,
    [userId, tripId, message, type]
  );
}

// Format Date objects to YYYY-MM-DD strings
function fmtRow(row) {
  const out = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] instanceof Date) {
      out[k] = out[k].toISOString().split('T')[0];
    }
  }
  return out;
}

function fmt(rows) {
  return Array.isArray(rows) ? rows.map(fmtRow) : fmtRow(rows);
}


app.post('/api/auth/logout', requireAuth, async (req, res) => {
  try {
    await pool.query(
      'UPDATE Sessions SET is_active = 0 WHERE session_id = ?',
      [req.user.session_id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/notifications', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT notification_id, user_id, trip_id, message, notification_type, is_read, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY created_at DESC`,
      [req.user.user_id]
    );
    res.json(fmt(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const [result] = await pool.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE notification_id = ? AND user_id = ?`,
      [req.params.id, req.user.user_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ── AUTH ──────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try { 
    const [[user]] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!user.is_active) return res.status(403).json({ error: 'Account is inactive' });

    // Users with no password hash: use default "admin" for dev/demo
    const hash = user.password_hash || await bcrypt.hash('admin', 10);
    const valid = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : password === 'admin';

    if (!valid) return res.status(401).json({ error: 'Invalid email or password' });

    const session = await createSession(user.user_id);
    const { password_hash, ...safe } = user;
    res.json({
      ...fmtRow(safe),
      session_token: session.sessionToken,
      expires_at: session.expiresAt.toISOString()
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/itineraries', requireAuth, async (req, res) => {
  try {
    const { trip_id } = req.query;
    if (!trip_id) {
      return res.status(400).json({ error: 'Trip is required' });
    }

    const trip = await getTripById(trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (!await canAccessTripOrMember(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [rows] = await pool.query(
      `SELECT itinerary_id, trip_id, activity_name, location, activity_date, activity_time, notes, created_at
       FROM itineraries
       WHERE trip_id = ?
       ORDER BY activity_date, activity_time, itinerary_id`,
      [trip_id]
    );
    res.json(fmt(rows));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/itineraries', requireAuth, async (req, res) => {
  try {
    const validationError = validateItineraryInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { trip_id, activity_name, location, activity_date, activity_time, notes } = req.body;
    const trip = await getTripById(trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (!await canAccessTripOrMember(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const [result] = await pool.query(
      `INSERT INTO itineraries (trip_id, activity_name, location, activity_date, activity_time, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [trip_id, activity_name.trim(), location || '', activity_date, activity_time || null, notes || '']
    );

    res.status(201).json({
      itinerary_id: result.insertId,
      trip_id,
      activity_name: activity_name.trim(),
      location: location || '',
      activity_date,
      activity_time: activity_time || null,
      notes: notes || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const existing = await getItineraryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Itinerary item not found' });
    }

    const validationError = validateItineraryInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { trip_id, activity_name, location, activity_date, activity_time, notes } = req.body;
    const trip = await getTripById(trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (!await canAccessTripOrMember(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query(
      `UPDATE itineraries
       SET trip_id = ?, activity_name = ?, location = ?, activity_date = ?, activity_time = ?, notes = ?
       WHERE itinerary_id = ?`,
      [trip_id, activity_name.trim(), location || '', activity_date, activity_time || null, notes || '', req.params.id]
    );

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/itineraries/:id', requireAuth, async (req, res) => {
  try {
    const existing = await getItineraryById(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Itinerary item not found' });
    }

    const trip = await getTripById(existing.trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (!await canAccessTripOrMember(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM itineraries WHERE itinerary_id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const validationError = validateRegistrationInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { first_name, last_name, email, phone_number, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [result] = await pool.query(
      `INSERT INTO users (first_name, last_name, email, role, phone_number, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, 1)`,
      [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), 'User', phone_number || '', hash]
    );

    res.status(201).json({
      user_id: result.insertId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim().toLowerCase(),
      role: 'User',
      phone_number: phone_number || '',
      is_active: 1
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});

// ── USERS ─────────────────────────────────────────────────────────────────────
// Suggested future protection: requireAuth, requireAdmin
app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT user_id, first_name, last_name, email, role, phone_number, is_active, created_at, updated_at
       FROM users
       ORDER BY user_id`
    );
    res.json(fmt(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});
// Suggested future protection: requireAuth, requireAdmin
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const validationError = validateRegistrationInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { first_name, last_name, email, role, phone_number, password, is_active } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const normalizedRole = normalizeRole(role);
    const normalizedActive = normalizeIsActive(is_active, 1);
    const [result] = await pool.query(
      `INSERT INTO users (first_name, last_name, email, role, phone_number, password_hash, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), normalizedRole, phone_number || '', hash, normalizedActive]
    );
    res.status(201).json({
      user_id: result.insertId,
      first_name: first_name.trim(),
      last_name: last_name.trim(),
      email: email.trim().toLowerCase(),
      role: normalizedRole,
      phone_number: phone_number || '',
      is_active: normalizedActive
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});
// Suggested future protection: requireAuth, requireAdmin
app.put('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE user_id = ? LIMIT 1', [req.params.id]);
    const current = existingUser[0][0];
    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (current.user_id === req.user.user_id && normalizeIsActive(req.body.is_active, current.is_active) === 0) {
      return res.status(400).json({ error: 'You cannot deactivate your own account' });
    }

    const validationError = validateUserUpdateInput(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { first_name, last_name, email, role, phone_number, password, is_active } = req.body;
    const normalizedRole = normalizeRole(role);
    const normalizedActive = normalizeIsActive(is_active, current.is_active);
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `UPDATE users
         SET first_name=?, last_name=?, email=?, role=?, phone_number=?, is_active=?, password_hash=?
         WHERE user_id=?`,
        [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), normalizedRole, phone_number || '', normalizedActive, hash, req.params.id]
      );
    } else {
      await pool.query(
        `UPDATE users
         SET first_name=?, last_name=?, email=?, role=?, phone_number=?, is_active=?
         WHERE user_id=?`,
        [first_name.trim(), last_name.trim(), email.trim().toLowerCase(), normalizedRole, phone_number || '', normalizedActive, req.params.id]
      );
    }

    if (current.role !== normalizedRole) {
      await logUserManagementAction(req.user.user_id, current.user_id, 'ROLE_UPDATE', current.role, normalizedRole);
    }
    if (Number(current.is_active) !== normalizedActive) {
      await logUserManagementAction(
        req.user.user_id,
        current.user_id,
        normalizedActive ? 'ACTIVATE' : 'DEACTIVATE',
        String(current.is_active),
        String(normalizedActive)
      );
      if (!normalizedActive) {
        await deactivateSessionsForUser(current.user_id);
      }
    }

    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }
    res.status(500).json({ error: err.message });
  }
});
// Suggested future protection: requireAuth, requireAdmin
app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const existingUser = await pool.query('SELECT * FROM users WHERE user_id = ? LIMIT 1', [req.params.id]);
    const current = existingUser[0][0];
    if (!current) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (current.user_id === req.user.user_id) {
      return res.status(400).json({ error: 'You cannot delete your own account' });
    }

    await logUserManagementAction(req.user.user_id, current.user_id, 'DELETE', current.email, 'deleted');
    await deactivateSessionsForUser(current.user_id);
    await pool.query('DELETE FROM users WHERE user_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRIPS ─────────────────────────────────────────────────────────────────────
app.get('/api/trips', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin';
    const requestedUserId = req.query.user_id;
    const targetUserId = isAdmin ? requestedUserId : req.user.user_id;
    let where = '';
    let params = [];
    if (!isAdmin) {
      where = 'WHERE (t.user_id = ? OR t.trip_id IN (SELECT trip_id FROM TripMembers WHERE user_id = ?))';
      params = [targetUserId, targetUserId];
    } else if (targetUserId) {
      where = 'WHERE t.user_id = ?';
      params = [targetUserId];
    }
    const [rows] = await pool.query(
      `SELECT t.*, CONCAT(u.first_name,' ',u.last_name) AS user_name,
              COALESCE(SUM(e.amount), 0) AS total_spent
       FROM trips t
       LEFT JOIN users u ON t.user_id = u.user_id
       LEFT JOIN expenses e ON e.trip_id = t.trip_id
       ${where}
       GROUP BY t.trip_id
       ORDER BY t.trip_id`,
      params
    );
    res.json(fmt(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trips', requireAuth, async (req, res) => {
  try {
    const validationError = validateTripInput(req.body, req.user.role === 'Admin');
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { user_id, destination, start_date, end_date, purpose, estimated_budget } = req.body;
    const tripUserId = req.user.role === 'Admin' ? user_id : req.user.user_id;
    const [result] = await pool.query(
      'INSERT INTO trips (user_id, destination, start_date, end_date, purpose, status, estimated_budget) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [tripUserId, destination, start_date, end_date, purpose, 'Pending', estimated_budget]
    );
    res.json({ trip_id: result.insertId, ...req.body, user_id: tripUserId, status: 'Pending' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/trips/:id', requireAuth, async (req, res) => {
  try {
    const existingTrip = await getTripById(req.params.id);
    if (!existingTrip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin && existingTrip.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const validationError = validateTripInput(req.body, isAdmin);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { user_id, destination, start_date, end_date, purpose, status, estimated_budget } = req.body;
    const nextUserId = isAdmin ? user_id : existingTrip.user_id;
    const nextStatus = isAdmin ? status : existingTrip.status;
    if (isAdmin && !isValidTripStatus(nextStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await pool.query(
      'UPDATE trips SET user_id=?, destination=?, start_date=?, end_date=?, purpose=?, status=?, estimated_budget=? WHERE trip_id=?',
      [nextUserId, destination, start_date, end_date, purpose, nextStatus, estimated_budget, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/trips/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    if (trip.status !== 'Pending') {
      return res.status(400).json({ error: 'Only pending trips can be approved or rejected' });
    }

    await pool.query('UPDATE trips SET status=? WHERE trip_id=?', [status, req.params.id]);
    await createNotification(
      trip.user_id,
      trip.trip_id,
      status === 'Approved' ? 'APPROVAL' : 'REJECTION',
      `Your trip to ${trip.destination} was ${status.toLowerCase()}.`
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/trips/:id', requireAuth, async (req, res) => {
  try {
    const existingTrip = await getTripById(req.params.id);
    if (!existingTrip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    if (req.user.role !== 'Admin' && existingTrip.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM trips WHERE trip_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── EXPENSES ──────────────────────────────────────────────────────────────────
app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'Admin';
    const where = isAdmin ? '' : 'WHERE e.user_id = ?';
    const params = isAdmin ? [] : [req.user.user_id];
    const [rows] = await pool.query(
      `SELECT e.*, t.destination
       FROM expenses e LEFT JOIN trips t ON e.trip_id = t.trip_id
       ${where}
       ORDER BY e.expense_id`,
      params
    );
    res.json(fmt(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  try {
    const validationError = validateExpenseInput(req.body, req.user.role === 'Admin');
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const { trip_id, user_id, category, amount, expense_date, description, receipt_url } = req.body;
    const trip = await getTripById(trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin && trip.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const expenseUserId = isAdmin ? user_id : req.user.user_id;
    const [result] = await pool.query(
      'INSERT INTO expenses (trip_id, user_id, category, amount, expense_date, description, receipt_url) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [trip_id, expenseUserId, category, amount, expense_date, description, receipt_url]
    );
    res.json({ expense_id: result.insertId, ...req.body, user_id: expenseUserId });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const existingExpense = await getExpenseById(req.params.id);
    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const { trip_id, user_id, category, amount, expense_date, description, receipt_url } = req.body;
    const validationError = validateExpenseInput(req.body, req.user.role === 'Admin');
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
    const trip = await getTripById(trip_id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const isAdmin = req.user.role === 'Admin';
    if (!isAdmin && existingExpense.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!isAdmin && trip.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const expenseUserId = isAdmin ? user_id : existingExpense.user_id;
    await pool.query(
      'UPDATE expenses SET trip_id=?, user_id=?, category=?, amount=?, expense_date=?, description=?, receipt_url=? WHERE expense_id=?',
      [trip_id, expenseUserId, category, amount, expense_date, description, receipt_url, req.params.id]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/expenses/:id', requireAuth, async (req, res) => {
  try {
    const existingExpense = await getExpenseById(req.params.id);
    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    if (req.user.role !== 'Admin' && existingExpense.user_id !== req.user.user_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await pool.query('DELETE FROM expenses WHERE expense_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── REPORTS ───────────────────────────────────────────────────────────────────
app.get('/api/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { date_from, date_to } = req.query;
    const conditions = [];
    const params = [];

    if (date_from) { conditions.push('r.generated_at >= ?'); params.push(date_from); }
    if (date_to)   { conditions.push('r.generated_at <= ?'); params.push(date_to + ' 23:59:59'); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `SELECT r.*, t.destination, CONCAT(u.first_name,' ',u.last_name) AS generated_by_name
       FROM reports r
       LEFT JOIN trips t ON r.trip_id = t.trip_id
       LEFT JOIN users u ON r.generated_by = u.user_id
       ${where}
       ORDER BY r.report_id`,
      params
    );
    res.json(fmt(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { trip_id, generated_by } = req.body;
    const [[{ total }]] = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE trip_id=?',
      [trip_id]
    );
    const [result] = await pool.query(
      'INSERT INTO reports (trip_id, generated_by, total_expenses, report_status) VALUES (?, ?, ?, ?)',
      [trip_id, generated_by, total, 'PENDING']
    );
    res.json({ report_id: result.insertId, trip_id, generated_by, total_expenses: total, report_status: 'PENDING' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/reports/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['PENDING', 'SUBMITTED', 'APPROVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid report status' });
    }
    const [result] = await pool.query(
      'UPDATE reports SET report_status = ? WHERE report_id = ?',
      [status, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Report not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/reports/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM reports WHERE report_id=?', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRIP MEMBERS (Collaboration) ──────────────────────────────────────────────
app.get('/api/trips/:id/members', requireAuth, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!await canAccessTripOrMember(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const [rows] = await pool.query(
      `SELECT tm.member_id, tm.user_id, tm.added_at,
              CONCAT(u.first_name,' ',u.last_name) AS user_name, u.email
       FROM TripMembers tm
       JOIN users u ON u.user_id = tm.user_id
       WHERE tm.trip_id = ?
       ORDER BY tm.added_at`,
      [req.params.id]
    );
    res.json(fmt(rows));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/trips/:id/members', requireAuth, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!canAccessTrip(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Only the trip owner or admin can add members' });
    }
    const { user_id } = req.body;
    if (!user_id || Number(user_id) <= 0) return res.status(400).json({ error: 'Select a valid user' });
    if (Number(user_id) === trip.user_id) return res.status(400).json({ error: 'Trip owner is already a member' });
    await pool.query(
      'INSERT INTO TripMembers (trip_id, user_id) VALUES (?, ?)',
      [req.params.id, user_id]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'User is already a member of this trip' });
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id/members/:userId', requireAuth, async (req, res) => {
  try {
    const trip = await getTripById(req.params.id);
    if (!trip) return res.status(404).json({ error: 'Trip not found' });
    if (!canAccessTrip(trip, req.user.user_id, req.user.role === 'Admin')) {
      return res.status(403).json({ error: 'Only the trip owner or admin can remove members' });
    }
    await pool.query(
      'DELETE FROM TripMembers WHERE trip_id = ? AND user_id = ?',
      [req.params.id, req.params.userId]
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = 3000;
app.listen(PORT, () => console.log(`TravelMS API running on http://localhost:${PORT}`));
