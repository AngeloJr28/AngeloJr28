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

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, calories INTEGER, protein INTEGER, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

app.post('/track', async (req, res) => {
    try {
        const { message, currentWeight } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `Act as a fitness tracker. User is ${currentWeight}kg. Input: "${message}".
        If food, estimate calories and protein. If weight update, find the number.
        Return ONLY this JSON format: {"type": "meal" or "weight", "val": number, "item": "string", "pro": number, "cal": number}`;

        const result = await model.generateContent(prompt);
        let text = result.response.text().replace(/```json|```/g, "").trim();
        const data = JSON.parse(text);

        if (data.type === 'weight') {
            db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [data.val]);
        } else {
            db.run(`INSERT INTO fitness_logs (item, calories, protein) VALUES (?, ?, ?)`, [data.item, data.cal, data.pro]);
        }
        res.json({ success: true, data });
    } catch (e) {
        console.error("AI Error:", e);
        res.status(500).json({ success: false, error: "Neural Link Error - Try again" });
    }
});

// Added Goal Start Date for Countdown
app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(calories) as c, SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, row) => {
        db.get(`SELECT weight, date as wDate FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, w) => {
            res.json({ calories: row?.c || 0, protein: row?.p || 0, weight: w?.weight || 0, lastUpdate: w?.wDate });
        });
    });
});

app.get('/weight-history', (req, res) => {
    db.all(`SELECT weight, date FROM weight_logs ORDER BY date DESC LIMIT 10`, (err, rows) => res.json(rows || []));
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`System Live`));