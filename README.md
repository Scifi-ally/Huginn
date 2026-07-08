# Huginn

> **Huginn is a privacy-first, borderless IDE and agent workspace powered entirely by local AI. It features seamless file editing and an integrated chat interface that runs local LLMs directly on your machine—guaranteeing absolute privacy with zero cloud dependencies.**

![Huginn Interface](ui/public/favicon.svg) <!-- Replace with an actual screenshot of the UI -->

Huginn provides an ultra-clean, minimalist interface designed for developers who want the power of AI agents without relying on third-party APIs or sending their codebase over the internet. 

## 🚀 Features

- **Local AI Powered**: Complete integration with your local LLMs. Your code and prompts stay on your machine.
- **Borderless & Minimalist UI**: A stunning, sleek interface with seamless light/dark mode and zero visual clutter.
- **Dynamic Workspaces**: Easily manage multiple project directories.
- **Integrated Code Editor**: Read, edit, and explore files seamlessly directly alongside the AI chat.
- **Background Agent Execution**: Run tasks in the background while you continue working.

## 🛠️ Tech Stack

- **Frontend**: React, Vite, TypeScript, TailwindCSS, Framer Motion
- **Backend**: Node.js, Express, TypeScript, WebSockets
- **Database**: PostgreSQL (via Docker), Drizzle ORM
- **Queue/Jobs**: BullMQ

## 💻 Getting Started (Multi-Device Setup)

Huginn is designed to run seamlessly on Windows, macOS, or Linux. 

### Prerequisites

1. **Node.js**: Ensure you have Node.js v18 or later installed.
2. **Docker**: Ensure Docker Desktop (or Docker Engine) is installed and running. This is required for spinning up the PostgreSQL database and Redis (for BullMQ).

### Installation & Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/Scifi-ally/Huginn.git
   cd Huginn
   ```

2. **Install Root Dependencies** (Backend):
   ```bash
   npm install
   ```

3. **Install UI Dependencies** (Frontend):
   ```bash
   cd ui
   npm install
   cd ..
   ```

4. **Start the Database**:
   The backend relies on PostgreSQL. We use Docker Compose to spin it up effortlessly.
   ```bash
   npm run db:up
   ```

5. **Push the Database Schema**:
   Initialize the database with Drizzle ORM.
   ```bash
   npm run db:push
   ```

6. **Start the Application**:
   Run the following command in the root directory to start both the backend server and the frontend UI concurrently.
   ```bash
   npm start
   ```

7. **Open the App**:
   Navigate to `http://localhost:5173` in your web browser.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the ISC License.
