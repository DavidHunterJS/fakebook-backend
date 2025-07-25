# Fakebook 📘

### A modern, full-stack Facebook clone built with cutting-edge JavaScript technologies and enterprise-grade DevOps practices.

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Node Version](https://img.shields.io/badge/node-18%2B-green)
![MongoDB Version](https://img.shields.io/badge/mongodb-5%2B-green)
![Next.js](https://img.shields.io/badge/NextJS-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Express](https://img.shields.io/badge/Express-4-lightgrey)
![Jenkins](https://img.shields.io/badge/CI%2FCD-Jenkins-red)
![Heroku](https://img.shields.io/badge/deployed-Heroku-purple)

## 🌐 Live Demo

- **Production**: [https://trippy.wtf](https://trippy.wtf)
- **Staging**: [https://fakebook-frontend-staging.herokuapp.com](https://fakebook-frontend-staging.herokuapp.com)

## 📋 Table of Contents

- [🚀 Overview](#-overview)
- [✨ Features](#-features)
- [🛠️ Tech Stack](#️-tech-stack)
- [🏗️ Architecture](#️-architecture)
- [🚀 Getting Started](#-getting-started)
- [🔄 Development Workflow](#-development-workflow)
- [🚦 CI/CD Pipeline](#-cicd-pipeline)
- [📡 API Documentation](#-api-documentation)
- [🤝 Contributing](#-contributing)
- [📝 License](#-license)

## 🚀 Overview

Fakebook is a full-stack social media application that demonstrates professional software development practices, from clean code architecture to automated CI/CD pipelines. Built as a learning project, it showcases real-world implementation of social networking features using the MERN stack with Next.js.

## ✨ Features

- **🔐 User Authentication** - Secure signup/login with JWT tokens
- **📝 Social Posts** - Create, edit, and delete posts with rich text
- **🤖 AI-Generated Text** - Craft post content with assistance from a generative AI model.
- **🎨 AI-Generated Images** - Create unique images for your posts using text prompts.
- **❤️ Interactions** - Like, comment, and share posts
- **👥 Friend System** - Send/accept friend requests, manage connections
- **📰 News Feed** - Personalized timeline with friends' posts
- **👤 User Profiles** - Customizable profiles with avatars
- **🔔 Notifications** - Real-time updates for interactions
- **📱 Responsive Design** - Seamless experience across all devices

## 🛠️-Tech-Stack

### Frontend
├── Next.js 14 # React framework with App Router
├── TypeScript # Type-safe JavaScript
├── Tailwind CSS # Utility-first styling
├── Axios # HTTP client
└── React Query # Data fetching and caching

### Backend
├── Node.js # JavaScript runtime
├── Express.js # Web application framework
├── MongoDB # NoSQL database
├── Mongoose # MongoDB object modeling
├── JWT # Authentication
└── Bcrypt # Password hashing

### AI / ML
├── Replicate #For generative text and image models.
└── Replicate #npm Package #API client library.

### DevOps
├── Jenkins # CI/CD automation
├── Heroku # Cloud platform
├── Git # Version control
└── GitHub # Code repository

# 🏗️-Architecture
┌─────────────────────────────────────────────────────────────┐
│                     Client (Next.js)                        │
├─────────────────────────────────────────────────────────────┤
│                         ↓ HTTPS ↓                           │
├─────────────────────────────────────────────────────────────┤
│                 API Gateway (Express.js)                    │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│ │ Auth Svc    │ │ Posts Svc   │ │ Friends Svc │ │ AI Svc  │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│         ┌──────────────────┐      ┌──────────────────┐      │
│         │Database (MongoDB)│      │  GenAI (OpenAI)  │      │
│         └──────────────────┘      └──────────────────┘      │
└─────────────────────────────────────────────────────────────┘

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- MongoDB 5.0+
- Git
- API Key from your chosen AI provider (e.g., Replicate)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/DavidHunterJS/fakebook.git
   cd fakebook

## Install backend dependencies
cd backend
npm install

## Install frontend dependencies
cd ../frontend
npm install
## Backend .env:
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/fakebook
JWT_SECRET=your-secret-key
CLIENT_URL=http://localhost:3000
REPLICATE_API_KEY=your-ai-provider-api-key
## Frontend .env.local:
NEXT_PUBLIC_API_URL=http://localhost:5000
## Start MongoDB
Backend .env:

## Start backend (from backend directory)
npm run dev

## Start frontend (from frontend directory)
npm run dev

## Access the application
Frontend: http://localhost:3000
Backend: http://localhost:5000

## -Development-Workflow

We follow a Git Feature Branch workflow:
main (production)
  └── develop (staging)
       └── feature/new-feature (development)

## Creating a Feature
## Create a new feature branch
git checkout -b feature/your-feature-name develop

## Make changes and commit
git add .
git commit -m "feat: add new feature"

## Push to GitHub
git push origin feature/your-feature-name

## Create a Pull Request to develop branch

## Deployment Flow

Feature → Develop: Merge feature branches into develop
Develop → Staging: Automatic deployment via Jenkins
Develop → Main: Create PR after staging validation
Main → Production: Deploy with manual approval

# 🚦 CI/CD Pipeline

## Our Jenkins pipeline automates the entire deployment process:
## Pipeline Stages

🔍 Environment Info - Display deployment target
📦 Checkout Code - Pull latest changes
💾 Backup Config - Save current configuration
📚 Install Dependencies - Install npm packages
🧪 Run Tests - Execute test suite
🔨 Build Application - Create production build
✅ Deployment Approval - Manual gate for production
🚀 Deploy to Heroku - Push to cloud
✔️ Verify Deployment - Health check

## Usage
## Deploy to Staging
- Environment: staging
- Branch: develop
- No approval required

## Deploy to Production
- Environment: production
- Branch: main
- Manual approval required

# 📡 API Documentation
## Authentication
POST /api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "securepassword"
}
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "securepassword"
}
## Posts
GET /api/posts
POST /api/posts

POST /api/posts/generate-text

- Description: Generates post text based on a prompt.

- Body: { "prompt": "Write a post about..." }

POST /api/posts/generate-image

-  Description: Generates an image based on a prompt.

-  Body: { "prompt": "A cat wearing a wizard hat..." }
## Friends
GET /api/friends
Authorization: Bearer <token>

POST /api/friends/request/:userId
Authorization: Bearer <token>

PUT /api/friends/accept/:requestId
Authorization: Bearer <token>

# 🧪 Testing
## Run all tests
npm test

## Run with coverage
npm run test:coverage

## Run in watch mode
npm run test:watch

# 📊 Project StrucAI / Machine Learning

    [e.g., OpenAI API]: For generative text and image models.

    [e.g., openai npm package]: API client library.ture
fakebook/
├── frontend/                 # Next.js frontend
│   ├── app/                 # App router pages
│   ├── components/          # React components
│   ├── lib/                # Utilities and helpers
│   ├── public/             # Static assets
│   └── styles/             # Global styles
│
├── backend/                 # Express.js backend
│   ├── controllers/        # Route controllers
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── middleware/        # Custom middleware
│   └── utils/             # Helper functions
│
└── .jenkins/               # Jenkins pipeline config
    └── Jenkinsfile        # Pipeline definition

# 🤝 Contributing
### We welcome contributions! Please follow these steps:

    Fork the repository
    Create a feature branch (git checkout -b feature/AmazingFeature)
    Commit your changes (git commit -m 'Add some AmazingFeature')
    Push to the branch (git push origin feature/AmazingFeature)
    Open a Pull Request

## Coding Standards

    Use ESLint and Prettier for code formatting
    Write meaningful commit messages
    Add tests for new features
    Update documentation as needed

# 📈 Performance

    Lighthouse Score: 95+
    Page Load Time: < 2s
    API Response Time: < 200ms
    Database Queries: Optimized with indexes

# 🔒 Security

    JWT token authentication
    Password hashing with bcrypt
    CORS configuration
    Rate limiting
    Input validation and sanitization
    HTTPS enforcement

# 📝 License

## This project is licensed under the MIT License - see the LICENSE file for details.
# 👥 Team

    David Hunter - Full Stack Developer - GitHub

# 🙏 Acknowledgments

    Next.js team for the amazing framework
    Heroku for seamless deployment
    MongoDB for the flexible database
    Jenkins for CI/CD automation

# Built with ❤️ using modern JavaScript
