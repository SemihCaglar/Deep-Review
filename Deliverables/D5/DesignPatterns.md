4. Design Patterns Used 

The implementation uses several architectural and implementation patterns that are directly visible in the current codebase. These patterns contribute to the separation of responsibilities between request handling, business logic, persistence, shared frontend state, and reusable interface structure. 

4.1 MVC / Layered Architecture Pattern 

The system follows a web-oriented MVC-style layered structure. The backend separates route definitions, controllers, services, and entities, while the frontend separates route pages, layout components, context, and API utilities. 

Implemented in: 
backend/src/routes/index.ts 
backend/src/controllers/AccountController.ts 
backend/src/controllers/PaperController.ts 
backend/src/controllers/RoundController.ts 
backend/src/services/PaperService.ts 
backend/src/services/RoundService.ts 
backend/src/entities/User.ts 
backend/src/entities/Paper.ts 
frontend/src/app/* 
frontend/src/components/layout/AppLayout.tsx 
frontend/src/lib/api.ts 

Reason for use: 
This structure separates responsibilities across the system. Routes define API endpoints, controllers handle HTTP request and response logic, services contain reusable business logic, and entities represent database models. On the frontend, pages represent user-facing screens, while shared layout components and API utilities reduce duplication and improve consistency. 

4.2 Repository Pattern 

The backend uses TypeORM repositories to access and modify database entities. Instead of writing raw SQL throughout the application, controllers and services access persistent data through repository objects. 

Implemented in: 
backend/src/data-source.ts 
backend/src/controllers/AccountController.ts 
backend/src/controllers/PaperController.ts 
backend/src/services/PaperService.ts 
backend/src/services/RoundService.ts 

Reason for use: 
The Repository Pattern abstracts database operations and keeps persistence access consistent. It makes entity operations such as finding, creating, updating, and saving records easier to manage through TypeORM and reduces the need for raw query logic throughout the codebase. 

4.3 Singleton Pattern 

The backend uses a single shared TypeORM data source instance for database access. 

Implemented in: 
backend/src/data-source.ts 

Reason for use: 
A single shared database connection/configuration object avoids repeatedly creating new data source instances. This centralizes database configuration and ensures that the backend uses one consistent connection setup. 

4.4 Chain of Responsibility Pattern 

The backend uses Express middleware chains for authentication and authorization. Requests pass through middleware functions before reaching the final controller method. 

Implemented in: 
backend/src/middleware/auth.ts 
backend/src/routes/index.ts 

Reason for use: 
This pattern allows access-control responsibilities to be handled step by step. A request is first authenticated, then role-checked, and only then passed to the controller. This avoids duplicating authorization logic inside every controller method and keeps route protection consistent. 

4.5 Facade Pattern 

The frontend uses a centralized API utility file that hides the details of raw backend requests from page components. 

Implemented in: 
frontend/src/lib/api.ts 

Reason for use: 
Frontend pages do not need to manually construct every request, attach authentication tokens, parse responses, or repeat common error-handling logic. The API utility layer provides a simpler and more consistent interface for backend communication. 

4.6 DRY Principle 

The codebase applies the DRY (Don’t Repeat Yourself) principle by centralizing repeated logic in shared modules. 

Implemented in: 
frontend/src/lib/api.ts 
frontend/src/lib/auth.ts 
backend/src/middleware/auth.ts 
backend/src/services/accountSecurity.ts 
backend/src/services/tokenService.ts 

Reason for use: 
Common logic such as API requests, token handling, authentication checks, password hashing, login lockout rules, and role checks is centralized instead of being reimplemented in multiple pages or controllers. This improves maintainability and reduces the likelihood of inconsistent behavior. 