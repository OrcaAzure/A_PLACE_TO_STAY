# AptSpace

AptSpace is a web-based housing and accommodation management system built with a Node.js + Express backend, MySQL database, and static frontend starter pages.

## Project Structure

```txt
APSTPACE-cleaned/
├── .env.example
├── README.md
└── client/
    ├── database/
    │   └── schema.sql
    ├── public/
    │   ├── index.html
    │   ├── login.html
    │   ├── dashboard.html
    │   └── assests/
    │       ├── css/
    │       │   └── main.css
    │       └── js/
    │           ├── api.js
    │           ├── auth.js
    │           └── ui.js
    └── server/
        ├── package.json
        └── src/
            ├── app.js
            ├── server.js
            ├── config/
            │   ├── db.js
            │   └── env.js
            ├── controllers/
            │   ├── auth.controller.js
            │   ├── booking.controller.js
            │   ├── room.controller.js
            │   └── user.controller.js
            ├── middleware/
            │   ├── auth.middleware.js
            │   └── role.middleware.js
            ├── models/
            │   ├── Booking.js
            │   ├── Payment.js
            │   ├── Room.js
            │   └── User.js
            ├── routes/
            │   ├── auth.routes.js
            │   ├── booking.routes.js
            │   ├── room.routes.js
            │   └── user.routes.js
            ├── services/
            │   ├── auth.service.js
            │   ├── booking.service.js
            │   └── email.service.js
            └── utils/
                ├── constants.js
                └── helpers.js
```

## Features

- JWT-based authentication
- Role-based access control
- Room management
- Booking management
- User management
- Basic payment model support
- Starter frontend pages

## Prerequisites

- Node.js 18+
- npm
- MySQL 8+

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd APSTPACE-cleaned
```

### 2. Install backend dependencies

```bash
cd client/server
npm install
```

### 3. Configure environment variables

Create a `.env` file inside `client/server` using `.env.example` as a guide.

Example:

```env
PORT=3000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=aptspace
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=7d
```

### 4. Set up the database

Import the SQL file:

```txt
client/database/schema.sql
```

This file contains the starter database tables used by the project.

### 5. Run the backend server

```bash
cd client/server
npm run dev
```

The API should be available at:

```txt
http://localhost:3000
```

## API Endpoints

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Rooms
- `GET /api/rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms`
- `PATCH /api/rooms/:id`
- `DELETE /api/rooms/:id`

### Bookings
- `GET /api/bookings`
- `GET /api/bookings/:id`
- `POST /api/bookings`
- `PATCH /api/bookings/:id`
- `DELETE /api/bookings/:id`

### Users
- `GET /api/users`
- `GET /api/users/:id`
- `PATCH /api/users/:id`
- `DELETE /api/users/:id`

## Roles

- Super Admin
- Admin
- Housing Admin
- GNC View Only
- Faculty
- Staff
- Missionary
- Student

## Notes

- The folder name `assests` is kept as-is to match the current project structure.
- The current files are starter code and can be expanded as the project grows.
- Do not commit your `.env` file.
- Keep database credentials private.

## Common Commands

```bash
npm run dev
npm start
```

## Troubleshooting

If the server does not start, check these first:

- MySQL is running
- The database name in `.env` matches your schema
- `client/server/.env` exists
- Dependencies are installed inside `client/server`
