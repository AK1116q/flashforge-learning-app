# FlashForge Learning App

FlashForge is a single-page flashcard learning application for Assignment 2. It demonstrates a modern front-end library, a backend API, persistent database storage, authentication, live search, and CRUD operations.

## Tech Stack

- Frontend: React single-page application in `public/index.html`
- Backend: Node.js HTTP server in `server.js`
- Database: JSON export in `data/db.json`
- Authentication: Password hashing with PBKDF2 and signed JWT-like tokens

## Main Features

- Register, login, logout
- Password hashing and token-based authentication
- Live search for decks and flashcards
- CRUD operations for decks
- CRUD operations for flashcards
- CRUD operations for learning history / quiz attempts
- Admin view for users, decks, cards, and learning history
- Single-page interactions without full-page reloads

## Run Locally

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Demo Accounts

```text
Admin
Email: admin@flashforge.test
Password: admin123

Student
Email: maya@student.test
Password: student123
```

## Suggested Video Recording Flow

1. Open the app and log in as the student.
2. Show that the page behaves as a single-page application.
3. Use live search to filter decks and cards.
4. Create a deck, update it, and delete or archive an item.
5. Add, edit, and delete flashcards inside a deck.
6. Start a study session and save a learning result.
7. Log in as admin and show users, decks, cards, and learning history.

## Repository Contents Required by the Assignment

- Source code: `server.js`, `public/index.html`, `public/styles.css`
- Database export: `data/db.json`
- Readme: `README.md`

