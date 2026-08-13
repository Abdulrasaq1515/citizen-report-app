const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);
app.use('/uploads', express.static(uploadsDir));

// In-memory data stores
let nextId = 1;
const categories = [
  { id: 1, name: 'Accident' },
  { id: 2, name: 'Fighting' },
  { id: 3, name: 'Rioting' },
];
const mediaStore = []; // { id, filename, url }
const posts = []; // { id, title, content, date, author, categories:[], featured_media }

// Multer setup for media uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const name = Date.now() + '-' + file.originalname;
    cb(null, name);
  },
});
const upload = multer({ storage: storage });

// Helper to extract username from mock token
function usernameFromToken(req) {
  const h = req.headers.authorization;
  if (!h) return null;
  const parts = h.split(' ');
  if (parts.length !== 2) return null;
  const token = parts[1];
  if (!token.startsWith('mocktoken-')) return null;
  return token.substring('mocktoken-'.length);
}

// ===== JWT token endpoint (mock) =====
app.post('/wp-json/jwt-auth/v1/token', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ message: 'username and password required' });
  }
  // Accept any username/password for mock. Return a token and display name.
  return res.json({ token: 'mocktoken-' + username, user_display_name: username });
});

// ===== users/me =====
app.get('/wp-json/wp/v2/users/me', (req, res) => {
  const username = usernameFromToken(req);
  if (!username) return res.status(401).json({ message: 'Invalid token' });
  return res.json({ id: 1, name: username, username: username });
});

// ===== categories =====
app.get('/wp-json/wp/v2/categories', (req, res) => {
  return res.json(categories);
});

// ===== media upload =====
app.post('/wp-json/wp/v2/media', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
  const id = nextId++;
  const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  const entry = { id: id, filename: req.file.filename, source_url: url };
  mediaStore.push(entry);
  return res.json(entry);
});

// ===== posts =====
app.get('/wp-json/wp/v2/posts', (req, res) => {
  let results = posts.slice();
  if (req.query.categories) {
    const cat = parseInt(req.query.categories, 10);
    results = results.filter(p => p.categories && p.categories.indexOf(cat) !== -1);
  }
  if (req.query.author) {
    const a = parseInt(req.query.author, 10);
    results = results.filter(p => p.author === a);
  }

  // Simulate _embed when requested
  const embed = req.query._embed === '1' || req.query._embed === 'true';
  if (embed) {
    results = results.map(p => {
      const r = Object.assign({}, p);
      r._embedded = {};
      if (p.featured_media) {
        const m = mediaStore.find(m => m.id === p.featured_media);
        if (m) r._embedded['wp:featuredmedia'] = [m];
      }
      // Terms (categories)
      r._embedded['wp:term'] = [ (p.categories||[]).map(cid => {
        const c = categories.find(x => x.id === cid);
        return c ? { id: c.id, name: c.name } : { id: cid, name: 'Unknown' };
      }) ];
      return r;
    });
  }

  return res.json(results);
});

app.post('/wp-json/wp/v2/posts', (req, res) => {
  const username = usernameFromToken(req);
  const author = username ? 1 : 0;
  const { title, content, status, categories: cats, featured_media } = req.body || {};
  if (!title || !content) return res.status(400).json({ message: 'title and content required' });
  const id = nextId++;
  const post = {
    id: id,
    title: { rendered: title },
    content: { rendered: content },
    excerpt: { rendered: content.substring(0, 120) },
    date: new Date().toISOString(),
    author: author,
    categories: Array.isArray(cats) ? cats.map(c => parseInt(c,10)) : [],
  };
  if (featured_media) post.featured_media = parseInt(featured_media, 10);
  posts.unshift(post); // newest first
  return res.status(201).json(post);
});

// Simple root index
app.get('/', (req, res) => res.send('CitizenReport mock server running'));

app.listen(PORT, () => {
  console.log(`Mock server listening on http://localhost:${PORT}`);
});
