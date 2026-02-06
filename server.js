
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Increase limit for base64 frames
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'dist')));

let games = [];
let prices = {};
let thresholds = { house1: 2, house2: 2 };
let videoSession = { houseId: null, status: 'idle', frame: null, quality: 'medium' };
let houseHeartbeats = { house1: 0, house2: 0 };

app.get('/api/games', (req, res) => res.json(games));
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

app.get('/api/prices', (req, res) => res.json(prices));
app.post('/api/prices', (req, res) => {
  if (req.body.prices) {
    prices = req.body.prices;
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid data' });
  }
});

app.get('/api/thresholds', (req, res) => res.json(thresholds));
app.post('/api/thresholds', (req, res) => {
  thresholds = { ...thresholds, ...req.body };
  res.status(200).json(thresholds);
});

// Heartbeat for status
app.post('/api/heartbeat', (req, res) => {
  const { houseId } = req.body;
  if (houseId && houseHeartbeats[houseId] !== undefined) {
    houseHeartbeats[houseId] = Date.now();
    res.status(200).json({ success: true });
  } else {
    res.status(400).json({ error: 'Invalid houseId' });
  }
});

app.get('/api/house-status', (req, res) => {
  const now = Date.now();
  const status = {
    house1: (now - houseHeartbeats.house1) < 10000,
    house2: (now - houseHeartbeats.house2) < 10000
  };
  res.json(status);
});

app.get('/api/video-session', (req, res) => res.json(videoSession));
app.post('/api/video-session', (req, res) => {
  videoSession = { ...videoSession, ...req.body };
  res.status(200).json(videoSession);
});

app.post('/api/video-frame', (req, res) => {
  videoSession.frame = req.body.frame;
  res.status(200).json({ success: true });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
