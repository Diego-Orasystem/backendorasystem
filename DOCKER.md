# Docker Configuration for OraSystem Backend

This document explains how to dockerize and run the OraSystem backend application using Docker and Docker Compose.

## Files Overview

- `Dockerfile` - Production Docker configuration
- `Dockerfile.dev` - Development Docker configuration with hot reload
- `docker-compose.yml` - Production Docker Compose setup
- `docker-compose.dev.yml` - Development Docker Compose override
- `.dockerignore` - Files to exclude from Docker build context
- `env.example` - Environment variables template

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- Node.js 18+ (for local development)

## Quick Start

### 1. Environment Setup

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Edit `.env` with your actual configuration values:
- Database connection details
- Email service credentials
- API keys and secrets

### 2. Production Deployment

Build and run the application in production mode:

```bash
# Build and start the container
npm run docker:compose

# Or using Docker Compose directly
docker-compose up --build -d
```

The application will be available at `http://localhost:3001`

### 3. Development Mode

For development with hot reload:

```bash
# Start development environment
npm run docker:compose:dev

# Or using Docker Compose directly
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Available Scripts

The following npm scripts are available for Docker operations:

```bash
# Build Docker image
npm run docker:build

# Run Docker container
npm run docker:run

# Start with Docker Compose (production)
npm run docker:compose

# Start with Docker Compose (development)
npm run docker:compose:dev
```

## Docker Compose Services

### Main Application (`app`)

- **Port**: 3001
- **Environment**: Production/Development
- **Volumes**: 
  - `./uploads:/app/uploads` - Persistent file storage
  - `./.env:/app/.env:ro` - Environment configuration
- **Health Check**: Available at `/health` endpoint

### Optional Database Service (`sqlserver`)

Uncomment the database service in `docker-compose.yml` if you want to run SQL Server locally:

```yaml
sqlserver:
  image: mcr.microsoft.com/mssql/server:2019-latest
  environment:
    - ACCEPT_EULA=Y
    - SA_PASSWORD=YourPassword123!
  ports:
    - "1433:1433"
```

## Health Monitoring

The application includes a health check endpoint at `/health` that returns:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 123.45,
  "environment": "production"
}
```

Docker health checks are configured to monitor this endpoint.

## Environment Variables

Key environment variables (see `env.example` for complete list):

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment mode (production/development) | No |
| `PORT` | Application port | No (default: 3001) |
| `DB_SERVER` | Database server address | Yes |
| `DB_DATABASE` | Database name | Yes |
| `DB_USER` | Database username | Yes |
| `DB_PASSWORD` | Database password | Yes |
| `EMAIL_USER` | Email service username | Yes |
| `EMAIL_PASS` | Email service password | Yes |

## Volumes and Data Persistence

### Upload Directory

The `./uploads` directory is mounted as a volume to persist uploaded files across container restarts.

### Environment Configuration

The `.env` file is mounted read-only to provide configuration without rebuilding the image.

## Networking

### Port Mapping

- Host port `3001` → Container port `3001`
- Modify the port mapping in `docker-compose.yml` if needed

### CORS Configuration

The application is configured to allow cross-origin requests. Modify CORS settings in the application code if needed.

## Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Check what's using port 3001
   netstat -tulpn | grep 3001
   
   # Kill the process or change the port in docker-compose.yml
   ```

2. **Permission Errors with Uploads**
   ```bash
   # Ensure uploads directory has correct permissions
   chmod 755 ./uploads
   ```

3. **Database Connection Issues**
   - Verify database credentials in `.env`
   - Ensure database server is accessible from Docker container
   - Check firewall settings

4. **Container Health Check Failures**
   ```bash
   # Check container logs
   docker-compose logs app
   
   # Test health endpoint manually
   curl http://localhost:3001/health
   ```

### Logs and Debugging

View application logs:

```bash
# Follow logs for all services
docker-compose logs -f

# View logs for specific service
docker-compose logs -f app

# Debug container
docker-compose exec app sh
```

## Security Considerations

- The application runs as a non-root user (`nextjs`) inside the container
- Sensitive files are excluded via `.dockerignore`
- Environment variables should never be hardcoded in Dockerfiles
- Use Docker secrets for production deployments

## Production Deployment

For production environments:

1. Use a reverse proxy (nginx/Apache) in front of the application
2. Configure proper SSL/TLS certificates
3. Set up log aggregation and monitoring
4. Use Docker Swarm or Kubernetes for orchestration
5. Implement backup strategies for the uploads volume
6. Use managed database services instead of containerized databases

## Development Workflow

1. Make code changes
2. The development container will automatically reload (nodemon)
3. Test your changes at `http://localhost:3001`
4. Use `docker-compose logs -f app` to monitor application logs

## Building for Different Environments

### Development
```bash
docker build -f Dockerfile.dev -t orasystem-backend:dev .
```

### Production
```bash
docker build -t orasystem-backend:latest .
```

## Integration with CI/CD

Example GitHub Actions workflow snippet:

```yaml
- name: Build Docker image
  run: docker build -t orasystem-backend:${{ github.sha }} .

- name: Run tests
  run: docker run --rm orasystem-backend:${{ github.sha }} npm test

- name: Deploy
  run: docker-compose up -d
``` 