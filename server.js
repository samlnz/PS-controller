
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// In-memory "Database" for simplicity. 
// For persistence on Railway across restarts, you would connect this to Redis or PostgreSQL.
let games = [];
let prices = {};

// API Routes
app.get('/api/games', (req, res) => {
  res.json(games);
});

app.post('/api/games', (req, res) => {
  if (req.body.games) {
    games = req.body.games;
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.delete('/api/games', (req, res) => {
  games = [];
  res.status(200).json({ success: true });
});

app.get('/api/prices', (req, res) => {
  res.json(prices);
});

app.post('/api/prices', (req, res) => {
  if (req.body.prices) {
    prices = req.body.prices;
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid data' });
  }
});

// Handle React Routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
