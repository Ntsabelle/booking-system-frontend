# Booking System Frontend

This repository contains the frontend interface for the Booking System. It provides a simple, user-friendly way for clients to book appointments and for administrators to log in and manage bookings. The frontend is built with plain HTML, CSS, and vanilla JavaScript, making it lightweight and easy to run in any modern browser.

## Features
- clients booking form
  - Collects clients details (name, branch, date, time slot, email, cellphone).
  - Validates required fields before submission.
  - Displays confirmation code after successful booking.
  - Handles conflicts (e.g., time slot already taken) with clear error messages.
- Admin login/logout
  - Secure login form for administrators.
  - Stores JWT token in sessionStorage after successful login.
  - Updates UI dynamically to show admin-only controls.
- Admin dashboard
  - Allows admins to view and manage appointments.
  - Protected endpoints require Authorization: Bearer <token> header.
- Dynamic UI updates
  - Spinner for loading states.
  - Toast notifications for success/error feedback.
  - Automatic refresh of available time slots after booking.

## Tech Stack
- HTML5
- CSS3
- Vanilla JavaScript
- Integration with Spring Boot backend via REST API

## How It Works
1. clientss fill out the booking form and submit → appointment is created via `POST /api/appointments`.
2. Admins log in with a password → receive JWT token from `POST /api/admin/login`.
3. Admin UI updates to show protected features → requests to `/api/appointments/**` include the stored token.

## Quick Start
1. Clone the repo:
   ```bash
   git clone https://github.com/Ntsabelle/booking-system-frontend.git
   cd booking-system-frontend
