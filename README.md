# SecureTrack

![License](https://img.shields.io/badge/license-MIT-blue)
![Security](https://img.shields.io/badge/Security-Management-red)
![Platform](https://img.shields.io/badge/Platform-Web%20Application-green)

SecureTrack is a full-stack enterprise security and project tracking platform built for security teams. It provides a centralized solution for managing vulnerability assessments, application inventories, IT assets, security findings, and reporting workflows.

---

## 🚀 Features

- 🔍 Track vulnerability assessments
- 📦 Manage application inventories
- 🖥️ Monitor IT assets
- 🚨 Vulnerability tracking
- 📊 Generate reports
- 📁 Centralized report management
- 🔐 Role-based access control
- 👥 Multi-user support
- 📈 Security assessment dashboard
- 📝 Finding lifecycle management

---

## 📸 Screenshots

### Dashboard

![Dashboard](images/dashboard.png)

---

## 📋 Overview

SecureTrack helps organizations streamline their security operations through a centralized platform for:

- Managing penetration testing and vulnerability assessments
- Tracking vulnerabilities from discovery to remediation
- Maintaining application and asset inventories
- Generating professional security reports
- Managing users through role-based access control
- Maintaining a centralized repository of security findings and reports

---

## 🏗️ Core Modules

### 🔍 Vulnerability Management

- Create and manage security assessments
- Track vulnerabilities and remediation status
- Assign findings to team members
- Monitor assessment progress

### 📦 Application Inventory

- Manage application records
- Track application ownership
- Maintain application metadata

### 🖥️ Asset Management

- Monitor IT assets
- Maintain asset inventory
- Track ownership and status

### 📊 Reporting

- Generate detailed security reports
- Export findings
- Centralized report repository
- Historical report tracking

### 🔐 Access Control

- User management
- Role-based permissions
- Secure authentication
- Administrative controls

---

## 🚀 How to Run

### Development Mode

#### Terminal 1 - Backend

```bash
cd backend
npm install
npm run dev
```

Backend runs on **Port 5000**

#### Terminal 2 - Frontend

```bash
cd frontend
npm install
npm start
```

Frontend runs on **Port 3000**

### Production Mode

In production the backend serves the compiled React client, so there is **one
process on port 5000** — no separate frontend server.

```bash
cd frontend && npm run build      # produces frontend/build
cd ../backend && npm run gen-secrets   # writes backend/.env, prints the admin password
NODE_ENV=production node server.js
```

The server refuses to start in production without real JWT secrets in
`backend/.env` and an existing `frontend/build`.

**Deploying on Windows Server?** Follow [DEPLOYMENT_WINDOWS.md](DEPLOYMENT_WINDOWS.md).
It covers running as an auto-starting Windows service, air-gapped installation,
HTTPS, backups and safe upgrades.

---

## 🔑 First Login

`npm run gen-secrets` creates the `admin` account and prints a random password —
save it, it is shown only once.

If you skip that step (development only), the seed falls back to
`admin` / `Admin@SecureTrack2024`. Never run production that way.

> Change the administrator password immediately after the first login.

---

## 🔒 Security Features

- JWT Authentication with rotating refresh tokens
- Role-Based Access Control (RBAC)
- Secure Session Management
- Protected API Endpoints
- Password Hashing (bcrypt, cost 12)
- Fine-Grained Authorization Controls
- Rate limiting on all endpoints, stricter on authentication
- Helmet security headers with a self-only Content Security Policy
- Input sanitisation and validation on every write path
- Full activity audit log

### Note on the Excel library

SheetJS stopped publishing to npm at `0.18.5`, which carries CVE-2023-30533
(prototype pollution on parse) and CVE-2024-22363 (ReDoS). Both are fixed in
`0.20.3`, so `package.json` aliases the dependency to the maintained npm mirror
of the same Apache-2.0 source:

```json
"xlsx": "npm:@e965/xlsx@^0.20.3"
```

Import specifiers stay `xlsx`, and installs resolve entirely from
`registry.npmjs.org` — no extra host needs to be reachable. To switch to the
vendor CDN build instead, change that one line to
`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.

## 🌐 Offline / Air-Gapped Operation

The application makes **no outbound network requests at runtime**. Webfonts are
self-hosted from `frontend/src/fonts/`, there are no CDN scripts, and the CSP
allows `'self'` only. It runs unchanged on an isolated network.

`deploy/windows/New-DeploymentPackage.ps1` builds a self-contained package on an
internet-connected machine and verifies the output contains no external
references before shipping it.

---

## 📄 License

This project is licensed under the MIT License.
