# SecureTrack



SecureTrack is a full-stack enterprise security and project tracking platform built for security teams. It provides a centralized solution for managing vulnerability assessments, application inventories, IT assets, security findings, and reporting workflows.

🚀 Features
🔍 Track vulnerability assessments
📦 Manage application inventories
🖥️ Monitor IT assets
🚨 Vulnerability tracking
📊 Generate reports
📁 Centralized report management
🔐 Role-based access control
👥 Multi-user support
📈 Security assessment dashboard
📝 Finding lifecycle management
📸 Screenshots
Dashboard




📋 Overview

SecureTrack helps organizations streamline their security operations through a centralized platform for:

Managing penetration testing and vulnerability assessments
Tracking vulnerabilities from discovery to remediation
Maintaining application and asset inventories
Generating professional security reports
Managing users through role-based access control
Maintaining a centralized repository of security findings and reports
🏗️ Core Modules
🔍 Vulnerability Management
Create and manage security assessments
Track vulnerabilities and remediation status
Assign findings to team members
Monitor assessment progress
📦 Application Inventory
Manage application records
Track application ownership
Maintain application metadata
🖥️ Asset Management
Monitor IT assets
Maintain asset inventory
Track ownership and status
📊 Reporting
Generate detailed security reports
Export findings
Centralized report repository
Historical report tracking
🔐 Access Control
User management
Role-based permissions
Secure authentication
Administrative controls
🚀 How to Run
Development Mode

Run the backend and frontend in separate terminals.

Terminal 1 - Backend
cd backend
npm install
npm run dev

Backend will start on Port 5000.

Terminal 2 - Frontend
cd frontend
npm install
npm start

Frontend will start on Port 3000.

Production Mode

Build the frontend and serve everything from the backend.

cd frontend
npm run build

cd ../backend
NODE_ENV=production node server.js

Application will be available on Port 5000.

🔑 Default Login Credentials
Username	Password
admin	Admin@SecureTrack2024

Change the default administrator password immediately after deployment.

🎯 Use Cases
Security Operations Teams
Penetration Testing Teams
Vulnerability Management Programs
Internal Security Assessments
Compliance Tracking
Enterprise Asset Management
🔒 Security Features
JWT Authentication
Role-Based Access Control (RBAC)
Secure Session Management
Protected API Endpoints
Password Hashing
Fine-Grained Authorization Controls
📄 License

This project is licensed under the MIT License.
