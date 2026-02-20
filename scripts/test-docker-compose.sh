#!/bin/bash
# Test script to verify docker-compose brings up a healthy service
# Requires: Docker, docker-compose, GOVEE_API_KEY environment variable

set -e

COMPOSE_PROJECT="govee-mcp-test"
TIMEOUT=60

echo "=== Testing Docker Compose ==="

# Check if GOVEE_API_KEY is set
if [ -z "${GOVEE_API_KEY}" ]; then
    echo "WARNING: GOVEE_API_KEY not set. Using a placeholder (health check will still pass)."
    export GOVEE_API_KEY="test-api-key-placeholder"
fi

# Cleanup function
cleanup() {
    echo "Cleaning up..."
    docker-compose -p "${COMPOSE_PROJECT}" down --volumes --remove-orphans 2>/dev/null || true
}

# Set trap for cleanup on exit
trap cleanup EXIT

# Build and start the service
echo "Building and starting service..."
docker-compose -p "${COMPOSE_PROJECT}" up -d --build

# Wait for the container to be healthy
echo "Waiting for container to become healthy (timeout: ${TIMEOUT}s)..."
CONTAINER_NAME="${COMPOSE_PROJECT}-govee-mcp-server-1"
SECONDS=0

while [ $SECONDS -lt $TIMEOUT ]; do
    HEALTH=$(docker inspect --format='{{.State.Health.Status}}' "${CONTAINER_NAME}" 2>/dev/null || echo "not_found")

    case "${HEALTH}" in
        "healthy")
            echo "SUCCESS: Container is healthy after ${SECONDS}s"
            break
            ;;
        "unhealthy")
            echo "FAILED: Container is unhealthy"
            echo "Container logs:"
            docker logs "${CONTAINER_NAME}" 2>&1 | tail -20
            exit 1
            ;;
        "starting")
            echo "  Status: starting (${SECONDS}s elapsed)..."
            sleep 2
            ;;
        "not_found")
            echo "  Waiting for container to start..."
            sleep 2
            ;;
        *)
            echo "  Unknown health status: ${HEALTH}"
            sleep 2
            ;;
    esac
done

if [ $SECONDS -ge $TIMEOUT ]; then
    echo "FAILED: Container did not become healthy within ${TIMEOUT}s"
    echo "Container logs:"
    docker logs "${CONTAINER_NAME}" 2>&1 | tail -20
    exit 1
fi

# Test the health endpoint directly
echo "Testing /healthz endpoint..."
HEALTH_RESPONSE=$(docker exec "${CONTAINER_NAME}" wget -qO- http://localhost:3000/healthz 2>/dev/null || true)

if echo "${HEALTH_RESPONSE}" | grep -q '"status":"ok"'; then
    echo "SUCCESS: /healthz endpoint responds correctly"
else
    echo "FAILED: /healthz endpoint did not respond with expected status"
    echo "Response: ${HEALTH_RESPONSE}"
    exit 1
fi

# Verify container is running as non-root
CONTAINER_USER=$(docker exec "${CONTAINER_NAME}" whoami 2>/dev/null || true)
if [ "${CONTAINER_USER}" = "nodejs" ]; then
    echo "SUCCESS: Container running as non-root user (nodejs)"
else
    echo "WARNING: Container running as user '${CONTAINER_USER}' (expected 'nodejs')"
fi

echo "=== All Docker Compose tests passed ==="
