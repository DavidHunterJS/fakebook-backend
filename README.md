## Getting Started

### Prerequisites
- Node.js
- MongoDB

### Installation
1. Clone the repository
\`\`\`bash
git clone https://github.com/yourusername/your-project-backend.git
cd your-project-backend
\`\`\`

2. Install dependencies
\`\`\`bash
npm install
\`\`\`

3. Set up environment variables
Create a \`.env\` file with the following variables:
\`\`\`
PORT=5000
MONGODB_URI=mongodb://localhost:27017/your-database
JWT_SECRET=your_jwt_secret
\`\`\`

4. Start the server
\`\`\`bash
npm run dev
\`\`\`

## API Documentation
API endpoints documentation goes here.
" > README.md
git add README.md
git commit -m "Add README"
git push
