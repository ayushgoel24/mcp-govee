#!/bin/bash
# Test script to verify Docker image builds successfully
# This script can be run in CI/CD pipelines or locally

set -e

IMAGE_NAME="govee-mcp-server"
TAG="test-build"

echo "=== Testing Docker Build ==="
echo "Building image: ${IMAGE_NAME}:${TAG}"

# Build the Docker image
docker build -t "${IMAGE_NAME}:${TAG}" .

# Verify the image was created
if docker image inspect "${IMAGE_NAME}:${TAG}" > /dev/null 2>&1; then
    echo "SUCCESS: Docker image built successfully"
else
    echo "FAILED: Docker image not found"
    exit 1
fi

# Verify image size is reasonable (under 200MB)
IMAGE_SIZE=$(docker image inspect "${IMAGE_NAME}:${TAG}" --format='{{.Size}}')
IMAGE_SIZE_MB=$((IMAGE_SIZE / 1024 / 1024))
echo "Image size: ${IMAGE_SIZE_MB}MB"

if [ "${IMAGE_SIZE_MB}" -gt 200 ]; then
    echo "WARNING: Image size exceeds 200MB"
fi

# Verify non-root user is configured
USER_CONFIG=$(docker image inspect "${IMAGE_NAME}:${TAG}" --format='{{.Config.User}}')
if [ "${USER_CONFIG}" = "nodejs" ]; then
    echo "SUCCESS: Non-root user configured"
else
    echo "FAILED: Expected user 'nodejs', got '${USER_CONFIG}'"
    exit 1
fi

# Verify exposed port
EXPOSED_PORTS=$(docker image inspect "${IMAGE_NAME}:${TAG}" --format='{{json .Config.ExposedPorts}}')
if echo "${EXPOSED_PORTS}" | grep -q "3000/tcp"; then
    echo "SUCCESS: Port 3000 exposed"
else
    echo "FAILED: Port 3000 not exposed"
    exit 1
fi

# Verify NODE_ENV is set to production
NODE_ENV_SET=$(docker image inspect "${IMAGE_NAME}:${TAG}" --format='{{range .Config.Env}}{{println .}}{{end}}' | grep "NODE_ENV=production" || true)
if [ -n "${NODE_ENV_SET}" ]; then
    echo "SUCCESS: NODE_ENV=production is set"
else
    echo "FAILED: NODE_ENV=production not set"
    exit 1
fi

# Cleanup test image
echo "Cleaning up test image..."
docker rmi "${IMAGE_NAME}:${TAG}" > /dev/null 2>&1 || true

echo "=== All Docker build tests passed ==="
