# 🚗 VirtuDrive AI

### AI-Powered Virtual Vehicle Performance Testing & Road Simulation Platform

VirtuDrive AI is an AI-powered virtual vehicle performance testing and road simulation platform designed to evaluate vehicle behavior under different road and driving conditions without requiring physical road tests.

The platform creates customizable virtual roads, simulates vehicle movement in a 3D environment, analyzes vehicle performance and safety parameters, and generates technical reports to support faster and more cost-effective vehicle testing.

---

## 🎯 Project Overview

Traditional vehicle testing requires physical vehicles, test tracks, fuel, equipment, and significant time and cost.

**VirtuDrive AI** provides a digital testing environment where users can configure road conditions and evaluate vehicle performance virtually.

The platform can analyze:

- 🚗 Vehicle speed
- 🛣️ Road slope and gradient
- ↪️ Road curves and direction
- ⚠️ Skidding risk
- 🔄 Vehicle rollover risk
- ⛽ Fuel consumption
- 🎯 Steering requirements
- 📊 Vehicle performance
- 📈 Simulation telemetry
- 🤖 AI-based technical analysis

---

## ✨ Key Features

### 🏠 Dashboard

Provides an overview of the simulation platform, available vehicles, simulations, reports, and important performance information.

### 🛣️ Custom Road Simulation

Users can create and customize virtual roads by changing parameters such as:

- Road length
- Road direction
- Curves
- Curve angle
- Transition length
- Road slope
- Banking angle
- Banking direction
- Number of slopes

### 🚘 3D Vehicle Simulation

The platform provides an interactive 3D environment for simulating vehicle movement over customizable road conditions.

The simulation includes:

- Vehicle movement
- Road-following behavior
- Vehicle orientation
- Road elevation
- Vehicle pitch
- Real-time simulation playback
- 3D proving-ground environment

### 📊 Vehicle Performance Analysis

The simulation analyzes important vehicle-performance parameters including:

- Speed
- Acceleration
- Slope capability
- Fuel consumption
- Vehicle stability
- Skidding risk
- Rollover risk

### 🤖 AI Analysis

AI-assisted analysis helps interpret simulation results and provides understandable technical insights and recommendations.

### 📄 Report Generation

The platform generates professional simulation reports containing:

- Simulation configuration
- Vehicle specifications
- Road conditions
- Performance results
- Safety analysis
- AI technical analysis
- Optimization recommendations

Reports can be generated in PDF format.

### 📈 Simulation Telemetry

The platform provides visual telemetry and performance information during and after simulation.

### 🔐 Authentication

User authentication is supported through Supabase authentication.

---

## 🏗️ System Architecture

```text
                    ┌─────────────────────┐
                    │      User           │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   VirtuDrive AI     │
                    │    Web Interface    │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                ▼                ▼
       ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
       │ Road        │  │ Vehicle     │  │ Simulation  │
       │ Configuration│ │ Configuration│ │ Engine      │
       └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                    ┌─────────────────────┐
                    │  3D Simulation      │
                    │  React Three Fiber  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │ Performance & Safety│
                    │      Analysis       │
                    └──────────┬──────────┘
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
             ┌─────────────┐      ┌─────────────┐
             │ AI Analysis │      │ PDF Reports │
             └─────────────┘      └─────────────┘
```

---

## 🧩 Main Modules

| Module               | Purpose                                       |
| -------------------- | --------------------------------------------- |
| Dashboard            | Overview of the platform and simulations      |
| Vehicle Management   | Configure and manage vehicle parameters       |
| Road Builder         | Create customized virtual roads               |
| Simulation           | Run virtual vehicle tests                     |
| 3D Playback          | Visualize vehicle movement                    |
| Performance Analysis | Analyze vehicle behavior                      |
| AI Assistant         | Provide AI-based analysis and recommendations |
| Reports              | Generate technical simulation reports         |
| Authentication       | Secure user access                            |

---

## 🛠️ Technologies Used

### Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- TanStack React Router
- TanStack React Query

### 3D & Simulation

- React Three Fiber
- React Three Drei
- Three.js

### Backend & Runtime

- TanStack Start
- Nitro
- Node.js 22+
- Supabase

### AI

- AI SDK
- `@ai-sdk/react`
- `@ai-sdk/openai-compatible`

### Reporting

- React PDF
- PDF report generation

### Authentication & Database

- Supabase Authentication
- Supabase Database

### Development Tools

- ESLint
- Prettier
- Vitest
- Git
- GitHub

---

## 📋 Requirements

Before running the project, make sure you have:

- Node.js 22 or later
- npm
- Git
- GitHub account
- Supabase project
- Required AI API credentials

## 🔄 Development Workflow

```text
Configure Vehicle
       ↓
Configure Road
       ↓
Create Simulation
       ↓
Run 3D Simulation
       ↓
Collect Telemetry
       ↓
Analyze Performance
       ↓
Evaluate Safety
       ↓
AI Technical Analysis
       ↓
Generate Report
```

---

## 📊 Example Simulation Parameters

The platform supports customizable road parameters such as:

| Parameter      | Description                               |
| -------------- | ----------------------------------------- |
| Direction      | Defines the direction of the road         |
| Angle          | Defines road/curve angle                  |
| Length         | Defines road segment length               |
| Transition     | Controls transition between road sections |
| Slope          | Defines road inclination                  |
| Bank           | Defines road banking                      |
| Bank Direction | Defines banking orientation               |

These parameters can be changed to create different testing scenarios.

---

## 🤖 AI-Powered Analysis

VirtuDrive AI can use AI services to interpret simulation results and provide technical insights.

The AI analysis can focus on:

- Vehicle performance
- Fuel consumption
- Stability
- Safety risks
- Operating conditions
- Performance limitations
- Optimization opportunities

The goal is to convert simulation data into information that engineers and users can understand and act upon.

---

## 📄 Reports

The reporting system generates technical reports containing:

1. Simulation Overview
2. Vehicle Specifications
3. Road Configuration
4. Performance Results
5. Safety Analysis
6. AI Technical Analysis
7. Optimization Recommendations

The generated report is designed to provide a clear summary of the virtual vehicle test.

---

## 🌐 Deployment

VirtuDrive AI is built using **TanStack Start + Nitro**, allowing it to be deployed using compatible modern hosting platforms.

The project can be configured for deployment on platforms such as:

- Vercel

Deployment configuration depends on the selected hosting platform and the project's runtime configuration.

---

## 🔒 Security

- Authentication is handled using Supabase.
- Sensitive API keys should be stored using environment variables.
- `.env` files should not be committed to GitHub.
- Production credentials should be configured through the hosting platform's environment-variable system.

---

## 🚧 Future Improvements

Planned improvements may include:

- Advanced vehicle dynamics
- More realistic tire-road interaction
- Weather simulation
- Different road surfaces
- Traffic simulation
- Advanced AI vehicle optimization
- More detailed vehicle models
- Real-world vehicle dataset integration
- Multi-vehicle simulation
- Cloud-based simulation history
- Advanced analytics dashboards
- Mobile-responsive simulation controls

---

## 🎯 Applications

VirtuDrive AI can be useful for:

- Automotive engineering
- Vehicle performance testing
- Academic research
- Engineering education
- Virtual prototyping
- Vehicle safety analysis
- Automotive R&D
- Simulation-based design
- EV and conventional vehicle testing

---

## 👨‍💻 Developer

**Varatharajan K**

B.Tech – Artificial Intelligence & Data Science

Interested in:

- Artificial Intelligence
- Data Science
- Automotive Technology
- Simulation
- AI Engineering
- Software Development

---

## 📜 License

This project is currently developed as an academic/engineering project.

License information can be added here when the project is released under a specific open-source license.

---

## ⭐ Acknowledgements

Built using modern web, AI, 3D simulation, and cloud technologies.

If you find this project interesting, consider giving the repository a ⭐.
