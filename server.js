const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

const app = express();
const db = new sqlite3.Database('./fitness.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

app.use(express.json());
app.use(express.static('public'));

// DATABASE INITIALIZATION
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item TEXT,
        calories INTEGER,
        protein INTEGER,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        weight REAL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// ROUTE: AI TRACKING
app.post('/track', async (req, res) => {
    const { message } = req.body;
    const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });

    const prompt = `User input: "${message}". 
    Categorize as MEAL, WEIGHT, or WORKOUT. 
    Return JSON ONLY:
    - MEAL: {"type": "meal", "item": string, "calories": number, "protein": number}
    - WEIGHT: {"type": "weight", "value": number}
    - WORKOUT: {"type": "workout", "recommendation": string}`;

    try {
        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());

        if (data.type === 'meal') {
            db.run(`INSERT INTO fitness_logs (item, calories, protein) VALUES (?, ?, ?)`, [data.item, data.calories, data.protein]);
        } else if (data.type === 'weight') {
            db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [data.value]);
        }
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: "AI Error" });
    }
});

// ROUTE: GET STATS
app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, row) => {
        const protein = row?.p || 0;
        db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, row) => {
            res.json({ protein, weight: row?.weight || "--" });
        });
    });
});

// ROUTE: GET HISTORY
app.get('/history', (req, res) => {
    db.all(`SELECT * FROM fitness_logs ORDER BY date DESC LIMIT 10`, [], (err, rows) => {
        res.json(rows);
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server live on port ${PORT}`));