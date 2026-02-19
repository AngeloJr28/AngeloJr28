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

        const prompt = `User Weight: ${currentWeight}kg. Input: "${message}". 
        Calculate Calories and Protein for this food weight. 
        Return ONLY JSON: {"item": "string", "calories": number, "protein": number, "isWeightUpdate": boolean, "weightVal": number}`;

        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text().replace(/```json|```/g, "").trim());

        if (data.isWeightUpdate) {
            db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [data.weightVal]);
        } else {
            db.run(`INSERT INTO fitness_logs (item, calories, protein) VALUES (?, ?, ?)`, [data.item, data.calories, data.protein]);
        }
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/stats', (req, res) => {
    db.get(`SELECT SUM(calories) as c, SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, row) => {
        db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, w) => {
            res.json({ calories: row?.c || 0, protein: row?.p || 0, weight: w?.weight || 0 });
        });
    });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Nutritionist Online`));