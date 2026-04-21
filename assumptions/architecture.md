# High-Level Architecture Assumptions

## Frontend Monolith
- The frontend (built with Next.js 14 and Tailwind CSS) is treated as a single unified monolith component for the purposes of the high-level architecture diagram. It encapsulates all user interfaces and frontend logic.
- It interacts with the backend strictly via the exposed REST API endpoints.

## Backend Layers Structure
- The Express.js Backend is conceptually and practically divided into distinct architectural layers representing the flow of data and control:
  1. **REST API / Routes**: The entry point for frontend HTTP requests (the master router).
  2. **Controllers**: Responsible for request validation, handling HTTP responses, and delegating work to the business logic layer.
  3. **Services / Agents**: Contains core business logic, algorithm processing, and external interactions (e.g., email dispatching).
  4. **Database Layer / Entities**: Managed via TypeORM, performing object-relational mapping and interacting directly with the local database.

## Database
- SQLite is used as the permanent storage mechanism and is represented directly behind the entity layer.
