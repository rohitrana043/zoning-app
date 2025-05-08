FROM postgis/postgis:16-3.5

# Health check to verify container is working properly
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD pg_isready -U postgres -h localhost || exit 1