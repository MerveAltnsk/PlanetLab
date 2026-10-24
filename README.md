# 🌍 PlanetLab — Procedural Sci-Fi Planet Creator

**Design unique fictional planets and explore them in an interactive 3D environment.**

🔗 **Live Demo:** [planet-lab-app.vercel.app](https://planet-lab-app.vercel.app)  
💻 **Source Code:** [GitHub Repository](https://github.com/MerveAltnsk/PlanetLab)

![PlanetLab Preview](https://github.com/user-attachments/assets/4d620e64-d1e5-453a-a9a7-d5920a94383e)

## ✨ About the Project

PlanetLab is an interactive 3D planet creation experience where users can experiment with planetary properties and explore different sci-fi worlds.

Adjust environmental parameters such as temperature, gravity, atmosphere, and water to create planets with different visual characteristics. The application combines procedural visual generation with an interactive interface to make planetary exploration engaging and intuitive.

This project was built as a hands-on exploration of modern web development, real-time 3D graphics, and AI-assisted software development workflows.

## 🚀 Features

- **Interactive 3D Planets** — Explore rotating, procedurally generated planetary surfaces.
- **Planet Customization** — Adjust temperature, gravity, atmosphere, and water levels.
- **Random Planet Generation** — Generate new planetary configurations with a single action.
- **Dynamic Visual Effects** — Explore different surface appearances, atmospheric effects, oceans, ice, and volcanic features.
- **Planet Saving Interface** — Create named planet configurations and view saved planets through the application.
- **Responsive Interface** — A modern interface designed for an immersive planet-building experience.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Next.js | Frontend framework |
| React | Component-based UI |
| TypeScript | Type-safe development |
| Tailwind CSS | Styling and responsive layouts |
| Three.js | 3D graphics |
| React Three Fiber | React integration for Three.js |
| C# / ASP.NET Core | Backend API |
| Entity Framework Core | Database access |
| SQLite | Local database storage |
| Vercel | Frontend deployment |

## 🏗️ Project Structure

```text
PlanetLab/
├── frontend/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── PlanetScene.tsx
│   │   └── globals.css
│   └── package.json
│
├── backend/
│   ├── Controllers/
│   ├── Data/
│   ├── Models/
│   ├── Migrations/
│   └── Program.cs
│
└── README.md
```

## 💻 Run Locally

### Prerequisites

- Node.js and npm
- .NET SDK 10
- Git

### 1. Clone the repository

```bash
git clone https://github.com/MerveAltnsk/PlanetLab.git
cd PlanetLab
```

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Start the backend

In a separate terminal:

```bash
cd backend
dotnet restore
dotnet run
```

The frontend expects the backend API at `http://localhost:5269` by default. If the API runs at a different address, configure `NEXT_PUBLIC_API_URL` accordingly.

## 🎯 Project Goals

PlanetLab explores how interactive 3D graphics and procedural visual techniques can be combined with a modern web application.

The project also provides practical experience with:

- Building interactive interfaces with React and TypeScript
- Rendering and animating 3D scenes
- Connecting a frontend to a REST API
- Structuring a full-stack application
- Deploying a web application using Vercel
- Using AI-assisted coding tools as part of an iterative development workflow

## 🔮 Future Improvements

- More diverse procedural terrain and planetary biomes
- Additional customization options and visual effects
- Enhanced planet exploration and discovery features
- Improved persistence and deployment of saved planets

---

**Built with curiosity, code, and a little cosmic imagination. ✨**
