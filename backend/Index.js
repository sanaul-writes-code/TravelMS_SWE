const pool = require('./db');

const user = {
  user_id: 1,
  first_name: 'Dhanush',
  last_name: 'Annoji',
  email: 'dhanush@example.com',
  role: 'Admin',
  phone_number: '1234567890'
};

const trip = {
  trip_id: 101,
  user_id: 1,
  destination: 'Paris',
  start_date: '2026-03-01',
  end_date: '2026-03-07',
  purpose: 'Conference',
  status: 'Planned',
  estimated_budget: 2500
};

const expense = {
  expense_id: 201,
  trip_id: 101,
  user_id: 1,
  category: 'Flight',
  amount: 1200,
  expense_date: '2026-03-01',
  description: 'Roundtrip flight',
  receipt_url: 'https://example.com/receipt.jpg'
};

async function insertData() {
  try {
    // Insert user
    await pool.query(
      `INSERT INTO users (user_id, first_name, last_name, email, role, phone_number) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [user.user_id, user.first_name, user.last_name, user.email, user.role, user.phone_number]
    );

    // Insert trip
    await pool.query(
      `INSERT INTO trips (trip_id, user_id, destination, start_date, end_date, purpose, status, estimated_budget) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [trip.trip_id, trip.user_id, trip.destination, trip.start_date, trip.end_date, trip.purpose, trip.status, trip.estimated_budget]
    );

    // Insert expense
    await pool.query(
      `INSERT INTO expenses (expense_id, trip_id, user_id, category, amount, expense_date, description, receipt_url) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [expense.expense_id, expense.trip_id, expense.user_id, expense.category, expense.amount, expense.expense_date, expense.description, expense.receipt_url]
    );

    console.log('Data inserted successfully!');
  } catch (err) {
    console.error('Error inserting data:', err);
  } finally {
    pool.end();
  }
}

insertData();