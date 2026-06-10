# AptSpace

A web-based housing and accommodation management system.

## Team Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd aptspace
```

### 2. Install Server Dependencies

```bash
cd server
npm install
```

### 3. Create Environment File

Create a `.env` file inside the `server` folder. (Only if you have no env.example)

Example:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=aptspace
JWT_SECRET=your_secret_key
```

### 4. Setup Database

Run the SQL script found in:

```txt
database/schema.sql
```

### 5. Start the Server

```bash
cd server
npm run dev
```

Server should be available at:

```txt
http://localhost:3000
```

---

## Project Structure

```txt
client/
server/
database/
```

### Backend Structure

```txt
src/
├── config/
├── controllers/
├── middleware/
├── models/
├── routes/
├── services/
├── utils/
├── app.js
└── server.js
```

---

## Roles

- Super Admin
- Admin
- Housing Admin
- GNC View Only
- Faculty
- Staff
- Missionary
- Student

---

## Current Progress

- Project structure created
- Express server initialized
- MySQL integration prepared
- Authentication module in progress

## Notes

- Do not commit `.env`
- Do not commit `node_modules`
- Always pull before pushing changes
