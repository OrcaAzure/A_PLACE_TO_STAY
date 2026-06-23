# AptSpace

AptSpace is a web-based housing and accommodation management system for Asia Pacific Theological Seminary (APTS). It uses a Node.js + Express backend, MySQL database, and a static HTML/Tailwind frontend with separate admin and guest portals.

## Project Structure

```txt
APSTPACE/
├── .env.example
├── README.md
├── package.json
└── client/
    ├── database/
    │   └── schema.sql
    ├── public/
    │   ├── index.html
    │   ├── login.html
    │   ├── admin/
    │   │   ├── dashboard.html
    │   │   ├── reservations.html
    │   │   ├── facilities.html
    │   │   ├── residents.html
    │   │   ├── payments.html
    │   │   └── settings.html
    │   ├── guest/
    │   │   ├── dashboard.html
    │   │   ├── reservations.html
    │   │   ├── facilities.html
    │   │   └── settings.html
    │   ├── components/
    │   └── assets/
    │       ├── css/
    │       └── js/
    │           ├── api.js
    │           ├── auth.js
    │           ├── dashboard.js
    │           ├── manage-requests.js
    │           ├── reservations.js
    │           ├── timeline.js
    │           └── ui.js
    └── server/
        ├── package.json
        └── src/
            ├── app.js
            ├── server.js
            ├── config/
            ├── controllers/
            ├── middleware/
            ├── models/
            ├── routes/
            ├── services/
            │   ├── auth.service.js
            │   └── booking.service.js
            └── utils/
```

## Features

- JWT-based authentication with role-based access control
- Room and booking management with seasonal pricing
- Overlap detection and capacity validation on new bookings
- Admin dashboard with live KPIs, activity feed, and approval queue
- Guest self-service booking and cancellation (pending only)
- User and payment management
- Facility catalog in database (API for facility bookings coming next)

## Prerequisites

- Node.js 18+
- npm
- MySQL 8+

## Setup

### 1. Clone the repository

```bash
git clone <repository-url>
cd APSTPACE
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
DEFAULT_PASSWORD=password
```

### 4. Set up the database

Import the SQL schema:

```bash
mysql -u root -p < client/database/schema.sql
```

Seed users are created automatically when the server starts (default password: `password` unless `DEFAULT_PASSWORD` is set).

### 5. Run the server

```bash
cd client/server
npm run dev
```

Open the app at [http://localhost:3000](http://localhost:3000).

**Default admin login:** `admin@aptspace.com` / `password`

## API Endpoints

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Rooms
- `GET /api/rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms` (admin)
- `PATCH /api/rooms/:id` (admin)
- `DELETE /api/rooms/:id` (admin)

### Bookings
- `GET /api/bookings`
- `GET /api/bookings/:id`
- `POST /api/bookings`
- `PATCH /api/bookings/:id` (admin: full update; guest: cancel own pending booking)
- `DELETE /api/bookings/:id` (admin)

### Users
- `GET /api/users` (admin)
- `GET /api/users/:id`
- `PATCH /api/users/:id` (admin)
- `DELETE /api/users/:id` (admin)

### Payments
- `GET /api/payments`
- `GET /api/payments/:id`

## Roles

- Super Admin
- Admin
- GNC View Only
- Faculty
- Staff
- Missionary
- Student

## Notes

- Do not commit your `.env` file.
- Booking totals are calculated from `room_rates` and `season_definitions` on create.
- The `facilities` and `facility_bookings` tables are seeded but not yet exposed via API.

## Common Commands

```bash
cd client/server
npm run dev
npm start
```

## Troubleshooting

If the server does not start, check these first:

- MySQL is running
- The database name in `.env` matches your schema
- `client/server/.env` exists
- Dependencies are installed inside `client/server`
