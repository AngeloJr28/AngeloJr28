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

// 1. DATABASE INITIALIZATION
db.serialize(() => {
    // Food & Macros Table
    db.run(`CREATE TABLE IF NOT EXISTS fitness_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        item TEXT, 
        calories INTEGER, 
        protein INTEGER, 
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Weight Tracking Table
    db.run(`CREATE TABLE IF NOT EXISTS weight_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        weight REAL, 
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    // Workout Completion Table
    db.run(`CREATE TABLE IF NOT EXISTS workout_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT, 
        type TEXT, 
        date DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// 2. MAIN TRACKING ROUTE (AI PROCESSING)
app.post('/track', async (req, res) => {
    try {
        const { message } = req.body;
        if (!process.env.GEMINI_API_KEY) throw new Error("API Key Missing in Render Settings");

        const model = genAI.getGenerativeModel({ 
            model: "gemini-1.5-flash", 
            generationConfig: { responseMimeType: "application/json" } 
        });

        const prompt = `User input: "${message}". 
        Identify if this is a MEAL, WEIGHT update, or WORKOUT completion.
        Return ONLY JSON:
        - MEAL: {"type": "meal", "item": string, "calories": number, "protein": number}
        - WEIGHT: {"type": "weight", "value": number}
        - WORKOUT: {"type": "workout", "name": string, "recommendation": string}`;

        const result = await model.generateContent(prompt);
        const data = JSON.parse(result.response.text());

        // Save data based on type
        if (data.type === 'meal') {
            db.run(`INSERT INTO fitness_logs (item, calories, protein) VALUES (?, ?, ?)`, [data.item, data.calories, data.protein]);
        } else if (data.type === 'weight') {
            db.run(`INSERT INTO weight_logs (weight) VALUES (?)`, [data.value]);
        } else if (data.type === 'workout') {
            db.run(`INSERT INTO workout_logs (type) VALUES (?)`, [data.name]);
        }
        
        res.json({ success: true, data });
    } catch (error) {
        console.error("AI Error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// 3. STATS & ANALYTICS ROUTE
app.get('/stats', (req, res) => {
    // Get Daily Protein
    db.get(`SELECT SUM(protein) as p FROM fitness_logs WHERE date(date) = date('now')`, (err, pRow) => {
        // Get Weekly Workout Count
        db.get(`SELECT COUNT(*) as wCount FROM workout_logs WHERE date(date) >= date('now', '-7 days')`, (err, wRow) => {
            // Get Latest Weight
            db.get(`SELECT weight FROM weight_logs ORDER BY date DESC LIMIT 1`, (err, weightRow) => {
                res.json({ 
                    protein: pRow?.p || 0, 
                    workouts: wRow?.wCount || 0, 
                    weight: weightRow?.weight || "--" 
                });
            });
        });
    });
});

// 4. UNIFIED HISTORY ROUTE
app.get('/history', (req, res) => {
    const sql = `
        SELECT item as title, protein || 'g P' as subtitle, date FROM fitness_logs 
        UNION 
        SELECT 'Workout: ' || type as title, 'COMPLETED' as subtitle, date FROM workout_logs 
        ORDER BY date DESC LIMIT 12`;
    
    db.all(sql, [], (err, rows) => {
        res.json(rows || []);
    });
});

// 5. CATCH-ALL FOR SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ELITE Server is running on port ${PORT}`));