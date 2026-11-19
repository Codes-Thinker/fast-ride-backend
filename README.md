# Indrive Backend API

A complete NestJS backend API for the Indrive ride-sharing application with authentication, user management, and image upload functionality.

## Features

✅ **User Authentication**
- User signup with email and phone verification
- OTP-based email verification using Nodemailer
- Secure login with JWT tokens
- Password change functionality
- Resend OTP capability

✅ **User Management**
- Complete profile management
- Update profile information
- Profile picture upload via Cloudinary
- Account activation/deactivation

✅ **Security**
- Password hashing with bcryptjs
- JWT-based authentication
- Request validation
- CORS enabled

✅ **Database**
- PostgreSQL with TypeORM
- Automatic migrations
- Entity relationships

✅ **Image Management**
- Cloudinary integration for image uploads
- Automatic image optimization
- Easy image deletion

## Project Structure

```
server/
├── src/
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── dto/
│   │   │   │   ├── signup.dto.ts
│   │   │   │   ├── login.dto.ts
│   │   │   │   ├── verify-otp.dto.ts
│   │   │   │   └── change-password.dto.ts
│   │   │   ├── guards/
│   │   │   │   └── jwt-auth.guard.ts
│   │   │   ├── services/
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── email.service.ts
│   │   │   ├── strategies/
│   │   │   │   └── jwt.strategy.ts
│   │   │   ├── auth.controller.ts
│   │   │   └── auth.module.ts
│   │   └── user/
│   │       ├── dto/
│   │       │   └── update-profile.dto.ts
│   │       ├── entities/
│   │       │   └── user.entity.ts
│   │       ├── services/
│   │       │   ├── user.service.ts
│   │       │   └── cloudinary.service.ts
│   │       ├── user.controller.ts
│   │       └── user.module.ts
│   ├── app.controller.ts
│   ├── app.module.ts
│   ├── app.service.ts
│   └── main.ts
├── .env
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

### Prerequisites
- Node.js 18+
- npm or yarn
- PostgreSQL 12+

### Setup Steps

1. **Clone/Navigate to the project**
```bash
cd server
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
```bash
# Copy the example env file
cp .env.example .env

# Edit .env with your configurations
# Required configurations:
# - Database credentials
# - JWT secret
# - Email credentials (Gmail with App Password)
# - Cloudinary credentials
```

4. **Create PostgreSQL Database**
```bash
# Create the database
createdb indrive

# Or use psql
psql -U postgres
CREATE DATABASE indrive;
```

5. **Run the application**
```bash
# Development mode
# Application
NODE_ENV=development
PORT=3001
CORS_ORIGIN=http://localhost:3000

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=shakeel
DB_NAME=fastride

# JWT Configuration
JWT_SECRET=replace-with-a-random-secret

# Email Configuration (Nodemailer)
SMTP_SERVICE=gmail
SMTP_USER=shakeeldev.tech@gmail.com
SMTP_PASSWORD=replace-with-the-smtp-app-password

# Cloudinary Configuration
CLOUDINARY_CLOUD_NAME=dpgdbecnu
CLOUDINARY_API_KEY=replace-with-the-cloudinary-api-key
CLOUDINARY_API_SECRET=replace-with-the-cloudinary-api-secret

# Frontend URL
FRONTEND_URL=http://localhost:3000

# Production mode
npm run build
npm run start:prod
```

<!-- npm run start:dev -->

The API will be running on `http://localhost:3001`

## API Endpoints

### Authentication Endpoints

#### 1. Sign Up
```
POST /api/auth/signup
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+91-9876543210",
  "password": "SecurePass123"
}

Response: 201 Created
{
  "message": "User registered successfully. Please verify your email with the OTP sent.",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+91-9876543210"
  }
}
```

#### 2. Verify OTP
```
POST /api/auth/verify-otp
Content-Type: application/json

{
  "email": "john@example.com",
  "otp": "123456"
}

Response: 200 OK
{
  "message": "Email verified successfully",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+91-9876543210"
  }
}
```

#### 3. Resend OTP
```
POST /api/auth/resend-otp
Content-Type: application/json

{
  "email": "john@example.com"
}

Response: 200 OK
{
  "message": "OTP resent successfully"
}
```

#### 4. Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePass123"
}

Response: 200 OK
{
  "message": "Logged in successfully",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "+91-9876543210",
    "profile_picture_url": null
  }
}
```

#### 5. Change Password
```
POST /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "old_password": "SecurePass123",
  "new_password": "NewSecurePass456",
  "confirm_password": "NewSecurePass456"
}

Response: 200 OK
{
  "message": "Password changed successfully"
}
```

#### 6. Get My Profile
```
GET /api/auth/me
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+91-9876543210",
  "bio": "I am a driver",
  "address": "123 Main St",
  "city": "New York",
  "state": "NY",
  "postal_code": "10001",
  "country": "USA",
  "profile_picture_url": "https://...",
  "is_email_verified": true,
  "is_active": true,
  "created_at": "2026-05-04T...",
  "updated_at": "2026-05-04T..."
}
```

### User Profile Endpoints

#### 1. Get Profile
```
GET /api/users/profile
Authorization: Bearer <token>

Response: 200 OK
{
  "id": "uuid",
  "name": "John Doe",
  ...
}
```

#### 2. Update Profile
```
PATCH /api/users/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe Updated",
  "bio": "I am a professional driver",
  "city": "Los Angeles",
  "state": "CA"
}

Response: 200 OK
{
  "message": "Profile updated successfully",
  "user": { ... }
}
```

#### 3. Upload Profile Picture
```
POST /api/users/profile-picture
Authorization: Bearer <token>
Content-Type: multipart/form-data

[file] - image file

Response: 201 Created
{
  "message": "Profile picture uploaded successfully",
  "url": "https://res.cloudinary.com/...",
  "user": { ... }
}
```

#### 4. Delete Profile Picture
```
DELETE /api/users/profile-picture
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Profile picture deleted successfully",
  "user": { ... }
}
```

#### 5. Deactivate Account
```
POST /api/users/deactivate
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Account deactivated successfully"
}
```

#### 6. Activate Account
```
POST /api/users/activate
Authorization: Bearer <token>

Response: 200 OK
{
  "message": "Account activated successfully"
}
```

### Health Check

#### Get Server Health
```
GET /health

Response: 200 OK
{
  "status": "ok",
  "timestamp": "2026-05-04T...",
  "uptime": 3600
}
```

## Environment Variables Configuration

### Database Configuration
```
DB_HOST=localhost          # PostgreSQL host
DB_PORT=5432             # PostgreSQL port
DB_USER=postgres         # PostgreSQL user
DB_PASSWORD=password     # PostgreSQL password
DB_NAME=indrive          # Database name
```

### Email Configuration (Nodemailer)
```
SMTP_SERVICE=gmail                    # Email service (gmail, outlook, etc.)
SMTP_USER=your-email@gmail.com       # Email address
SMTP_PASSWORD=your-app-password      # App-specific password
```

**For Gmail:**
1. Enable 2-factor authentication on your Gmail account
2. Create an App Password from: https://myaccount.google.com/apppasswords
3. Use the generated password in SMTP_PASSWORD

### Cloudinary Configuration
```
CLOUDINARY_CLOUD_NAME=your-cloud-name    # From Cloudinary dashboard
CLOUDINARY_API_KEY=your-api-key          # From Cloudinary dashboard
CLOUDINARY_API_SECRET=your-api-secret    # From Cloudinary dashboard
```

### JWT Configuration
```
JWT_SECRET=your-super-secret-key         # Change this in production
```

## Dependencies

### Core
- `@nestjs/common` - NestJS common module
- `@nestjs/core` - NestJS core
- `@nestjs/platform-express` - Express adapter

### Database
- `@nestjs/typeorm` - TypeORM integration
- `typeorm` - ORM
- `pg` - PostgreSQL driver

### Authentication
- `@nestjs/jwt` - JWT module
- `@nestjs/passport` - Passport integration
- `passport-jwt` - JWT strategy
- `bcryptjs` - Password hashing

### Email
- `nodemailer` - Email sending
- `@types/nodemailer` - TypeScript types

### File Upload
- `cloudinary` - Image upload service

### Validation
- `class-validator` - Data validation
- `class-transformer` - Data transformation

### Utilities
- `dotenv` - Environment variables
- `reflect-metadata` - Metadata reflection
- `rxjs` - Reactive programming

## Scripts

```bash
# Development
npm run start:dev          # Start with auto-reload

# Production
npm run build             # Build the project
npm run start:prod        # Start production server

# Other
npm run start             # Start the application
npm test                  # Run tests
npm run lint             # Run linter
```

## Error Handling

The API returns appropriate HTTP status codes and error messages:

- `200 OK` - Successful request
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid input
- `401 Unauthorized` - Invalid credentials
- `409 Conflict` - Resource already exists
- `404 Not Found` - Resource not found
- `500 Internal Server Error` - Server error

## Security Best Practices

1. **Change JWT_SECRET in production** - Use a strong, random string
2. **Use HTTPS only** in production
3. **Store sensitive data** securely (use environment variables)
4. **Validate all inputs** - Already implemented with class-validator
5. **Use strong passwords** - Enforced by regex pattern
6. **Enable CORS** only for trusted origins
7. **Keep dependencies updated** - Run `npm audit` regularly
8. **Hash passwords** - Using bcryptjs with salt rounds

## Troubleshooting

### Database Connection Error
```
Check if PostgreSQL is running:
- Windows: services.msc
- Mac: brew services list
- Linux: systemctl status postgresql

Verify connection details in .env file
```

### Email Not Sending
```
1. Verify SMTP credentials in .env
2. Check email provider's app password
3. Ensure port 587 is not blocked
4. Check email provider's security settings
```

### Cloudinary Upload Error
```
1. Verify cloud credentials in .env
2. Check file size limits
3. Ensure correct folder names
4. Check internet connection
```

### JWT Token Errors
```
1. Verify JWT_SECRET is set in .env
2. Check token hasn't expired
3. Ensure Authorization header format: "Bearer <token>"
```

## Future Enhancements

- [ ] Ride booking functionality
- [ ] Rating and review system
- [ ] Payment integration
- [ ] Real-time notifications
- [ ] Location tracking
- [ ] Driver documents verification
- [ ] Admin dashboard
- [ ] Advanced search filters

## Support

For issues and questions, please create an issue on the repository.

## License

This project is licensed under the MIT License.

---

**Happy Coding! 🚀**
