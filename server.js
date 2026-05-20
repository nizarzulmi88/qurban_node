const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// 🔧 KONFIGURASI DATABASE
const DB_CONFIG = {
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'root',
  database: 'qurban_db',
  waitForConnections: true,
  connectionLimit: 10
};

const TABLES = {
  users: `id VARCHAR(50) PRIMARY KEY, username VARCHAR(50) UNIQUE, password VARCHAR(100), role VARCHAR(20), nama VARCHAR(100)`,
  hewan: `id VARCHAR(50) PRIMARY KEY, jenis VARCHAR(50), jumlah INT, berat DECIMAL(10,2), harga DECIMAL(15,2), donatur_id VARCHAR(50), status VARCHAR(50), created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  donatur: `id VARCHAR(50) PRIMARY KEY, nama VARCHAR(100), hp VARCHAR(20), alamat TEXT, jenis_qurban VARCHAR(50), created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  mustahik: `id VARCHAR(50) PRIMARY KEY, nama VARCHAR(100), kategori VARCHAR(50), hp VARCHAR(20), alamat TEXT, jumlah INT, status_distribusi VARCHAR(20) DEFAULT 'Belum', created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  panitia: `id VARCHAR(50) PRIMARY KEY, nama VARCHAR(100), jabatan VARCHAR(50), hp VARCHAR(20), tugas TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  distribusi: `id VARCHAR(50) PRIMARY KEY, tanggal DATE, mustahik_id VARCHAR(50), hewan_id VARCHAR(50), bagian VARCHAR(20), berat DECIMAL(10,2), status VARCHAR(50), created_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
  kupon: `id VARCHAR(50) PRIMARY KEY, code VARCHAR(100) UNIQUE, mustahik_id VARCHAR(50), bagian VARCHAR(20), tanggal DATE, used BOOLEAN DEFAULT FALSE, used_at DATETIME`,
  activity: `id VARCHAR(50) PRIMARY KEY, text TEXT, time DATETIME DEFAULT CURRENT_TIMESTAMP`
};

let dbPool = null;

async function initDB() {
  let conn = null;
  try {
    conn = await mysql.createConnection({ ...DB_CONFIG, database: 'mysql' });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\``);
    await conn.query(`USE \`${DB_CONFIG.database}\``);
    
    for (const [table, schema] of Object.entries(TABLES)) {
      await conn.query(`CREATE TABLE IF NOT EXISTS ${table} (${schema})`);
    }
    
    const [cnt] = await conn.query('SELECT COUNT(*) as c FROM users');
    if (cnt[0].c === 0) {
      await conn.execute(`INSERT INTO users VALUES ('admin','admin','admin123','admin','Administrator')`);
      await conn.execute(`INSERT INTO users VALUES ('editor','editor','editor123','editor','Editor')`);
      await conn.execute(`INSERT INTO users VALUES ('viewer','viewer','viewer123','viewer','Viewer')`);
    }
    
    await conn.end();
    dbPool = mysql.createPool(DB_CONFIG);
    console.log(`✅ Database: ${DB_CONFIG.database}`);
    return true;
  } catch (error) {
    console.error('❌ DB Error:', error.message);
    if (conn) try { await conn.end(); } catch (e) {}
    return false;
  }
}

// 🔐 LOGIN
app.post('/api/login', async (req, res) => {
  try {
    const { u, p } = req.body;
    const [rows] = await dbPool.query('SELECT * FROM users WHERE username = ? AND password = ?', [u, p]);
    if (rows.length > 0) res.json({ success: true, user: rows[0] });
    else res.status(401).json({ success: false, message: 'Username atau password salah' });
  } catch (error) { res.status(500).json({ success: false, message: error.message }); }
});

// 📊 CRUD - Generic dengan validasi table name
const VALID_TABLES = ['hewan', 'donatur', 'mustahik', 'panitia', 'distribusi', 'kupon', 'activity'];

app.get('/api/:table', async (req, res) => {
  try {
    if (!VALID_TABLES.includes(req.params.table)) return res.status(400).json({ error: 'Invalid table' });
    const [rows] = await dbPool.query(`SELECT * FROM ${req.params.table} ORDER BY created_at DESC`);
    res.json(rows);
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/api/:table', async (req, res) => {
  try {
    if (!VALID_TABLES.includes(req.params.table)) return res.status(400).json({ error: 'Invalid table' });
    const id = req.body.id || Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    const body = { ...req.body, id };
    delete body.created_at;
    
    const columns = Object.keys(body).filter(k => body[k] !== undefined).join(', ');
    const placeholders = Object.keys(body).filter(k => body[k] !== undefined).map(() => '?').join(', ');
    const values = Object.keys(body).filter(k => body[k] !== undefined).map(k => body[k]);
    
    await dbPool.query(`INSERT INTO ${req.params.table} (${columns}) VALUES (${placeholders})`, values);
    res.json({ success: true, id });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.put('/api/:table/:id', async (req, res) => {
  try {
    if (!VALID_TABLES.includes(req.params.table)) return res.status(400).json({ error: 'Invalid table' });
    const { id } = req.params;
    const body = { ...req.body };
    delete body.created_at;
    delete body.id;
    
    const columns = Object.keys(body).filter(k => body[k] !== undefined).map(col => `${col} = ?`).join(', ');
    const values = [...Object.keys(body).filter(k => body[k] !== undefined).map(k => body[k]), id];
    
    await dbPool.query(`UPDATE ${req.params.table} SET ${columns} WHERE id = ?`, values);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

app.delete('/api/:table/:id', async (req, res) => {
  try {
    if (!VALID_TABLES.includes(req.params.table)) return res.status(400).json({ error: 'Invalid table' });
    await dbPool.query(`DELETE FROM ${req.params.table} WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) { res.status(500).json({ error: error.message }); }
});

// 🌐 SPA Fallback
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 🚀 Start
async function start() {
  if (!await initDB()) { console.error('⚠️ DB init failed'); process.exit(1); }
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
}
start();

process.on('SIGINT', async () => { if (dbPool) await dbPool.end(); process.exit(0); });