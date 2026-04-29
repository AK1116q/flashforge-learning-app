const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "db.json");
const SECRET = process.env.JWT_SECRET || "assignment-2-flashforge-secret";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function now() {
  return new Date().toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

function base64url(input) {
  return Buffer.from(JSON.stringify(input)).toString("base64url");
}

function signToken(user) {
  const header = base64url({ alg: "HS256", typ: "JWT" });
  const payload = base64url({
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8
  });
  const signature = crypto.createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyToken(token) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac("sha256", SECRET).update(`${parts[0]}.${parts[1]}`).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const attempt = hashPassword(password, salt).split(":")[1];
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(attempt));
}

function defaultDb() {
  const admin = {
    id: "user_admin",
    name: "Admin Tutor",
    email: "admin@flashforge.test",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    createdAt: now()
  };
  const student = {
    id: "user_maya",
    name: "Maya Chen",
    email: "maya@student.test",
    passwordHash: hashPassword("student123"),
    role: "student",
    createdAt: now()
  };
  const deck1 = {
    id: "deck_js",
    ownerId: student.id,
    title: "JavaScript Core Concepts",
    subject: "Web Development",
    description: "Key terms for modern front-end development.",
    createdAt: now(),
    updatedAt: now()
  };
  const deck2 = {
    id: "deck_db",
    ownerId: student.id,
    title: "Database Essentials",
    subject: "Backend",
    description: "CRUD, schemas, indexes, and API persistence.",
    createdAt: now(),
    updatedAt: now()
  };
  return {
    users: [admin, student],
    decks: [deck1, deck2],
    cards: [
      { id: "card_vdom", deckId: deck1.id, front: "What is a virtual DOM?", back: "A lightweight in-memory representation of UI that helps libraries update the real DOM efficiently.", difficulty: "medium", createdAt: now(), updatedAt: now() },
      { id: "card_spa", deckId: deck1.id, front: "What makes an app a SPA?", back: "It updates views dynamically in one HTML page without requesting a new page for every interaction.", difficulty: "easy", createdAt: now(), updatedAt: now() },
      { id: "card_crud", deckId: deck2.id, front: "What does CRUD stand for?", back: "Create, Read, Update, and Delete.", difficulty: "easy", createdAt: now(), updatedAt: now() }
    ],
    history: [
      { id: "hist_seed", userId: student.id, deckId: deck1.id, score: 2, total: 2, notes: "Seed study session", createdAt: now() }
    ]
  };
}

function ensureDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
    return;
  }
  const db = JSON.parse(fs.readFileSync(DB_FILE, "utf8") || "{}");
  if (!db.users || db.users.length === 0) {
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  }
}

function readDb() {
  ensureDb();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function publicUser(user) {
  const { passwordHash, ...safeUser } = user;
  return safeUser;
}

function send(res, status, body, contentType = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType });
  if (Buffer.isBuffer(body)) return res.end(body);
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function getAuthUser(req, db) {
  const header = req.headers.authorization || "";
  const payload = verifyToken(header.replace("Bearer ", ""));
  if (!payload) return null;
  return db.users.find(user => user.id === payload.sub) || null;
}

function requireAuth(req, res, db) {
  const user = getAuthUser(req, db);
  if (!user) send(res, 401, { error: "Authentication required" });
  return user;
}

function canAccessDeck(user, deck) {
  return user.role === "admin" || deck.ownerId === user.id;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const db = readDb();
  const method = req.method;

  try {
    if (url.pathname === "/api/register" && method === "POST") {
      const body = await parseBody(req);
      if (!body.name || !body.email || !body.password) return send(res, 400, { error: "Name, email, and password are required" });
      if (db.users.some(user => user.email.toLowerCase() === body.email.toLowerCase())) return send(res, 409, { error: "Email is already registered" });
      const user = { id: id("user"), name: body.name.trim(), email: body.email.trim().toLowerCase(), passwordHash: hashPassword(body.password), role: "student", createdAt: now() };
      db.users.push(user);
      writeDb(db);
      return send(res, 201, { token: signToken(user), user: publicUser(user) });
    }

    if (url.pathname === "/api/login" && method === "POST") {
      const body = await parseBody(req);
      const user = db.users.find(item => item.email.toLowerCase() === String(body.email || "").toLowerCase());
      if (!user || !verifyPassword(body.password || "", user.passwordHash)) return send(res, 401, { error: "Invalid email or password" });
      return send(res, 200, { token: signToken(user), user: publicUser(user) });
    }

    if (url.pathname === "/api/me" && method === "GET") {
      const user = requireAuth(req, res, db);
      if (!user) return;
      return send(res, 200, { user: publicUser(user) });
    }

    const user = requireAuth(req, res, db);
    if (!user) return;

    if (url.pathname === "/api/summary" && method === "GET") {
      const visibleDecks = user.role === "admin" ? db.decks : db.decks.filter(deck => deck.ownerId === user.id);
      const visibleDeckIds = new Set(visibleDecks.map(deck => deck.id));
      return send(res, 200, {
        users: user.role === "admin" ? db.users.map(publicUser) : [publicUser(user)],
        decks: visibleDecks,
        cards: db.cards.filter(card => visibleDeckIds.has(card.deckId)),
        history: user.role === "admin" ? db.history : db.history.filter(item => item.userId === user.id)
      });
    }

    if (url.pathname === "/api/decks" && method === "POST") {
      const body = await parseBody(req);
      if (!body.title || !body.subject) return send(res, 400, { error: "Title and subject are required" });
      const deck = { id: id("deck"), ownerId: user.id, title: body.title.trim(), subject: body.subject.trim(), description: body.description || "", createdAt: now(), updatedAt: now() };
      db.decks.push(deck);
      writeDb(db);
      return send(res, 201, deck);
    }

    const deckMatch = url.pathname.match(/^\/api\/decks\/([^/]+)$/);
    if (deckMatch && ["PUT", "DELETE"].includes(method)) {
      const deck = db.decks.find(item => item.id === deckMatch[1]);
      if (!deck) return send(res, 404, { error: "Deck not found" });
      if (!canAccessDeck(user, deck)) return send(res, 403, { error: "Forbidden" });
      if (method === "DELETE") {
        db.decks = db.decks.filter(item => item.id !== deck.id);
        db.cards = db.cards.filter(card => card.deckId !== deck.id);
        db.history = db.history.filter(item => item.deckId !== deck.id);
        writeDb(db);
        return send(res, 200, { ok: true });
      }
      const body = await parseBody(req);
      Object.assign(deck, {
        title: body.title || deck.title,
        subject: body.subject || deck.subject,
        description: body.description ?? deck.description,
        updatedAt: now()
      });
      writeDb(db);
      return send(res, 200, deck);
    }

    if (url.pathname === "/api/cards" && method === "POST") {
      const body = await parseBody(req);
      const deck = db.decks.find(item => item.id === body.deckId);
      if (!deck || !canAccessDeck(user, deck)) return send(res, 403, { error: "Deck is not available" });
      if (!body.front || !body.back) return send(res, 400, { error: "Front and back are required" });
      const card = { id: id("card"), deckId: deck.id, front: body.front.trim(), back: body.back.trim(), difficulty: body.difficulty || "medium", createdAt: now(), updatedAt: now() };
      db.cards.push(card);
      writeDb(db);
      return send(res, 201, card);
    }

    const cardMatch = url.pathname.match(/^\/api\/cards\/([^/]+)$/);
    if (cardMatch && ["PUT", "DELETE"].includes(method)) {
      const card = db.cards.find(item => item.id === cardMatch[1]);
      if (!card) return send(res, 404, { error: "Card not found" });
      const deck = db.decks.find(item => item.id === card.deckId);
      if (!deck || !canAccessDeck(user, deck)) return send(res, 403, { error: "Forbidden" });
      if (method === "DELETE") {
        db.cards = db.cards.filter(item => item.id !== card.id);
        writeDb(db);
        return send(res, 200, { ok: true });
      }
      const body = await parseBody(req);
      Object.assign(card, {
        front: body.front || card.front,
        back: body.back || card.back,
        difficulty: body.difficulty || card.difficulty,
        updatedAt: now()
      });
      writeDb(db);
      return send(res, 200, card);
    }

    if (url.pathname === "/api/history" && method === "POST") {
      const body = await parseBody(req);
      const deck = db.decks.find(item => item.id === body.deckId);
      if (!deck || !canAccessDeck(user, deck)) return send(res, 403, { error: "Deck is not available" });
      const record = {
        id: id("hist"),
        userId: user.id,
        deckId: deck.id,
        cardId: body.cardId || null,
        type: body.type || "session",
        score: Number(body.score || 0),
        total: Number(body.total || 0),
        notes: body.notes || "",
        createdAt: now()
      };
      db.history.push(record);
      writeDb(db);
      return send(res, 201, record);
    }

    const historyMatch = url.pathname.match(/^\/api\/history\/([^/]+)$/);
    if (historyMatch && method === "DELETE") {
      const record = db.history.find(item => item.id === historyMatch[1]);
      if (!record) return send(res, 404, { error: "History not found" });
      if (user.role !== "admin" && record.userId !== user.id) return send(res, 403, { error: "Forbidden" });
      db.history = db.history.filter(item => item.id !== record.id);
      writeDb(db);
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: "API route not found" });
  } catch (error) {
    return send(res, 500, { error: error.message });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requested = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(ROOT, "public", requested));
  if (!filePath.startsWith(path.join(ROOT, "public"))) return send(res, 403, "Forbidden", "text/plain");
  fs.readFile(filePath, (error, data) => {
    if (error) {
      fs.readFile(path.join(ROOT, "public", "index.html"), (fallbackError, fallbackData) => {
        if (fallbackError) return send(res, 404, "Not found", "text/plain");
        send(res, 200, fallbackData, mimeTypes[".html"]);
      });
      return;
    }
    send(res, 200, data, mimeTypes[path.extname(filePath)] || "application/octet-stream");
  });
}

ensureDb();

http.createServer((req, res) => {
  if (req.url.startsWith("/api/")) return handleApi(req, res);
  return serveStatic(req, res);
}).listen(PORT, () => {
  console.log(`FlashForge is running at http://localhost:${PORT}`);
});
