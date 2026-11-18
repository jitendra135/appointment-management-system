# Wellnest Appointment Management

A responsive appointment scheduling app with a React + Vite frontend and a Node.js API.

## Features

- Create, edit, confirm, complete, cancel, and delete appointments.
- Browse the week or a full appointment list; search and filter by status.
- Manage care providers and clinic open/closed status.
- Configure clinic hours; bookings are checked against provider conflicts and clinic hours.
- Persist clinic settings and appointments locally in JSON.

## Requirements

- Node.js 20 or newer
- npm

## Run locally

Install dependencies from the project root:

```powershell
npm install
```

Start the API in one terminal:

```powershell
npm run server
```

Start the frontend in a second terminal:

```powershell
npm run dev -- --host 0.0.0.0 --port 8443
```

Open http://localhost:8443/. The API listens on port 3001.

## Data and privacy

The API stores data in `server/appointments.json`, which is ignored by Git. On first run, it creates demo records if no data file exists. This demo has no authentication; do not enter real patient information or expose the API publicly without adding appropriate access controls and secure storage.
