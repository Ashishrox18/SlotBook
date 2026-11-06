#!/bin/sh
# Creates a separate test database so integration/concurrency tests never touch
# the application's data. Tests set TEST_DATABASE_URL to use slotbook_test.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  CREATE DATABASE slotbook_test;
  GRANT ALL PRIVILEGES ON DATABASE slotbook_test TO slotbook;
EOSQL
