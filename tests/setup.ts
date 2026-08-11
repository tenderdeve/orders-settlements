// Unit tests must run without a database, so this file may not open a connection
// at import time. Integration helpers (resetDb, makeUser) are added alongside the
// integration suites.
process.env.AUTH_SECRET ??= "test-secret-not-for-production";
