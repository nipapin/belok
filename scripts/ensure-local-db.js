const { Client } = require('pg');

async function main() {
  const c = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:5432/postgres',
  });
  await c.connect();

  const role = await c.query("SELECT 1 FROM pg_roles WHERE rolname = 'belok'");
  if (!role.rowCount) {
    await c.query(
      "CREATE ROLE belok WITH LOGIN PASSWORD 'nK9pQm2xR7vL4wJ8tZ3bH6cF1sY5gD0'"
    );
    console.log('role created');
  } else {
    console.log('role exists');
  }

  const db = await c.query("SELECT 1 FROM pg_database WHERE datname = 'belok'");
  if (!db.rowCount) {
    await c.query('CREATE DATABASE belok OWNER belok');
    console.log('db created');
  } else {
    console.log('db exists');
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
