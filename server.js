const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const db = new sqlite3.Database('./fitness.db');

app.use(express.json());
app.use(express.static('public'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, protein INTEGER, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

app.post('/manual-track', (req, res) => {
    const { type, item, value } = req.body;
    if (type === 'meal') {
        db.run(`INSERT INTO fitness_logs (item, protein) VALUES (?, ?)`, [item, value]);
    } else if (type === 'weight') {
        db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [value]);
    }
    res.json({ success: true });
});

app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, pRow) => {
        db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, wRow) => {
            res.json({ protein: pRow?.p || 0, weight: wRow?.weight || 0 });
        });
    });
});

app.get('/weight-history', (req, res) => {
    db.all(`SELECT weight, date FROM weight_logs ORDER BY date DESC LIMIT 15`, (err, rows) => {
        res.json(rows || []);
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Stable Manual Server Live`));