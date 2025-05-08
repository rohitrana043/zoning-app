FROM postgis/postgis:16-3.4

# These variables will be overridden by Railway
ENV POSTGRES_PASSWORD=postgres
ENV POSTGRES_USER=postgres
ENV POSTGRES_DB=railway

# Create a default database and enable PostGIS
RUN mkdir -p /docker-entrypoint-initdb.d
RUN echo "CREATE EXTENSION postgis; CREATE EXTENSION postgis_topology;" > /docker-entrypoint-initdb.d/enable-postgis.sql