const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const app = express();
const db = new sqlite3.Database('./fitness.db');

app.use(express.json());
app.use(express.static('public'));

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, calories INTEGER, protein INTEGER, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

app.post('/manual-log', (req, res) => {
    const { type, item, cal, pro, weight } = req.body;
    if (type === 'meal') {
        const finalCal = parseInt(cal) || 0;
        const finalPro = parseInt(pro) || 0;
        db.run(`INSERT INTO fitness_logs (item, calories, protein) VALUES (?, ?, ?)`, 
            [item || 'Meal', finalCal, finalPro], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
    } else if (type === 'weight') {
        const finalWeight = parseFloat(weight) || 0;
        db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [finalWeight], (err) => {
            if (err) return res.status(500).json({ success: false });
            res.json({ success: true });
        });
    }
});

app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(calories) as c, SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, row) => {
        db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, w) => {
            res.json({ calories: row?.c || 0, protein: row?.p || 0, weight: w?.weight || 0 });
        });
    });
});

app.get('/daily-history', (req, res) => {
    db.all(`SELECT item, calories, protein, time(date) as t FROM fitness_logs WHERE date(date) = date('now') ORDER BY date DESC`, (err, rows) => {
        res.json(rows || []);
    });
});

app.get('/weight-history', (req, res) => {
    db.all(`SELECT weight, date FROM weight_logs ORDER BY date DESC LIMIT 10`, (err, rows) => res.json(rows || []));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Manual Server Online`));