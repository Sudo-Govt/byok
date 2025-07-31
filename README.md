# BYOK - Bring Your Own Keys

A comprehensive project management platform built with modern technologies.

## Architecture

This is a full-stack application with the following structure:

### Backend
- **Shared Utilities** (`backend/shared/`) - Common utilities, middleware, and types used across all backend services
- **Project Service** (`backend/project-service/`) - Microservice for project management functionality

### Frontend
- **React Application** (`frontend/`) - Modern React frontend with TypeScript

## Features

### Backend Features
- **Comprehensive Utilities**:
  - Logging with Winston
  - Metrics collection and monitoring
  - Security utilities (JWT, encryption, validation)
  - Custom API error handling
  - Redis caching implementation
  - Queue management with Bull
  - Database utilities with PostgreSQL
  - Data validation with Joi

- **Middleware**:
  - Global error handling
  - Rate limiting with Redis
  - Request validation
  - Authentication and authorization

- **Project Service**:
  - Full CRUD operations for projects
  - Advanced filtering and pagination
  - Search functionality
  - Project statistics
  - Admin operations

### Frontend Features
- **Project Management Components**:
  - ProjectList - Displays projects with filtering, search, and pagination
  - ProjectCard - Individual project display with actions
  - ProjectForm - Create and edit projects
  - ProjectDetails - Detailed project view with tabs

- **Custom Hooks**:
  - useProjectApi - API operations and state management
  - useProjectActions - Create, update, delete operations

## Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: PostgreSQL
- **Cache**: Redis
- **Queue**: Bull (Redis-based)
- **Authentication**: JWT
- **Validation**: Joi
- **Logging**: Winston
- **Testing**: Jest

### Frontend
- **Framework**: React 18
- **Language**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: React Query
- **HTTP Client**: Axios
- **Forms**: React Hook Form
- **Styling**: Tailwind CSS (configured)

## Getting Started

### Prerequisites
- Node.js 18 or higher
- npm 8 or higher
- PostgreSQL database
- Redis server

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Sudo-Govt/byok
   cd byok
   ```

2. **Install all dependencies**
   ```bash
   npm run install:all
   ```

3. **Set up environment variables**
   
   Create `.env` files in each service directory:

   **Backend Project Service** (`backend/project-service/.env`):
   ```env
   # Server
   PORT=3001
   NODE_ENV=development
   
   # Database
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=byok
   DB_USER=postgres
   DB_PASSWORD=your_password
   
   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=
   
   # JWT
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d
   
   # CORS
   CORS_ORIGIN=http://localhost:3000
   ```

   **Frontend** (`frontend/.env`):
   ```env
   REACT_APP_API_URL=http://localhost:3001/api
   ```

4. **Set up the database**
   ```bash
   # Create database and run migrations
   npm run migrate
   
   # Optional: Seed with sample data
   npm run seed
   ```

### Development

**Start all services in development mode:**
```bash
npm run dev
```

This will start:
- Backend API server on http://localhost:3001
- Frontend development server on http://localhost:3000

**Start services individually:**
```bash
# Backend only
npm run dev:backend

# Frontend only
npm run dev:frontend
```

### Building for Production

```bash
# Build all services
npm run build

# Build individually
npm run build:backend
npm run build:frontend
```

### Testing

```bash
# Run all tests
npm test

# Run backend tests
npm run test:backend

# Run frontend tests
npm run test:frontend
```

### Linting

```bash
# Lint all code
npm run lint

# Fix linting issues
npm run lint:backend
npm run lint:frontend
```

## API Documentation

### Project Endpoints

- `GET /api/projects` - Get user's projects with filtering and pagination
- `POST /api/projects` - Create a new project
- `GET /api/projects/:id` - Get a specific project
- `PUT /api/projects/:id` - Update a project
- `DELETE /api/projects/:id` - Delete a project
- `GET /api/projects/stats` - Get project statistics

### Admin Endpoints

- `GET /api/projects/admin/all` - Get all projects (admin only)
- `GET /api/projects/admin/search` - Search all projects (admin only)

### Health Check

- `GET /health` - Service health check
- `GET /metrics` - Service metrics

## Project Structure

```
byok/
├── backend/
│   ├── shared/                     # Shared utilities and middleware
│   │   ├── src/
│   │   │   ├── utils/             # Utility functions
│   │   │   │   ├── logger.ts      # Logging utility
│   │   │   │   ├── metrics.ts     # Metrics collection
│   │   │   │   ├── security.ts    # Security utilities
│   │   │   │   ├── ApiError.ts    # Custom error handling
│   │   │   │   ├── cache.ts       # Caching implementation
│   │   │   │   ├── queue.ts       # Queue management
│   │   │   │   ├── database.ts    # Database utilities
│   │   │   │   └── validation.ts  # Data validation
│   │   │   └── middleware/        # Express middleware
│   │   │       ├── errorHandler.ts # Global error handling
│   │   │       ├── rateLimiter.ts  # Rate limiting
│   │   │       ├── validator.ts    # Request validation
│   │   │       └── auth.ts         # Authentication
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── project-service/           # Project management service
│       ├── src/
│       │   ├── controllers/       # Route handlers
│       │   ├── routes/           # Route definitions
│       │   ├── services/         # Business logic
│       │   ├── validators/       # Validation schemas
│       │   └── index.ts          # Service entry point
│       ├── package.json
│       └── tsconfig.json
├── frontend/                      # React frontend
│   ├── src/
│   │   ├── components/
│   │   │   └── Project/          # Project-related components
│   │   │       ├── ProjectList.tsx
│   │   │       ├── ProjectCard.tsx
│   │   │       ├── ProjectForm.tsx
│   │   │       └── ProjectDetails.tsx
│   │   └── hooks/                # Custom React hooks
│   │       ├── useProjectApi.ts
│   │       └── useProjectActions.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── package.json                   # Root package.json with workspace config
└── README.md
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue in the GitHub repository or contact the development team.