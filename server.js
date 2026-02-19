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
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, item TEXT, calories INTEGER, protein INTEGER, carbs INTEGER, fat INTEGER, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, weight REAL, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
    db.run(`CREATE TABLE IF NOT EXISTS workout_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, date DATETIME DEFAULT CURRENT_TIMESTAMP)`);
});

app.post('/track', async (req, res) => {
    try {
        const { message } = req.body;
        // Updated model string for better compatibility
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `User input: "${message}". Identify intent: MEAL, WEIGHT, or WORKOUT. 
        Return ONLY a clean JSON object:
        {"type": "meal", "item": "name", "calories": 0, "protein": 0, "carbs": 0, "fat": 0} 
        OR {"type": "weight", "value": 0} 
        OR {"type": "workout", "name": "name", "recommendation": "string"}`;

        const result = await model.generateContent(prompt);
        const text = result.response.text().replace(/```json|```/g, "").trim();
        const data = JSON.parse(text);

        if (data.type === 'meal') {
            db.run(`INSERT INTO fitness_logs (item, calories, protein, carbs, fat) VALUES (?, ?, ?, ?, ?)`, 
                [data.item, data.calories, data.protein, data.carbs, data.fat]);
        } else if (data.type === 'weight') {
            db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [data.value]);
        } else if (data.type === 'workout') {
            db.run(`INSERT INTO workout_logs (type) VALUES (?)`, [data.name]);
        }
        res.json({ success: true, data });
    } catch (error) {
        console.error("System Error:", error.message);
        res.status(500).json({ success: false, error: "Neural Link Failure: " + error.message });
    }
});

app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(protein) as p, SUM(carbs) as c, SUM(fat) as f FROM fitness_logs WHERE date(date) = date('now')`, (err, rows) => {
        db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, w) => {
            db.get(`SELECT COUNT(*) as wk FROM workout_logs WHERE date(date) >= date('now', '-7 days')`, (err, wk) => {
                res.json({ p: rows?.p || 0, c: rows?.c || 0, f: rows?.f || 0, weight: w?.weight || "--", workouts: wk?.wk || 0 });
            });
        });
    });
});

app.get('/history', (req, res) => {
    db.all(`SELECT item as t, protein || 'g P' as s, date FROM fitness_logs UNION SELECT 'Workout: ' || type, 'COMPLETE', date FROM workout_logs ORDER BY date DESC LIMIT 10`, (err, r) => res.json(r || []));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Elite Server Online`));