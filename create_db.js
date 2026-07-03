const mariadb = require('mariadb');
require('dotenv').config();

async function createDatabase() {
  let conn;
  try {
    conn = await mariadb.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: 'atete200218'
    });
    
    await conn.query("CREATE DATABASE IF NOT EXISTS agedash");
    console.log("Database 'agedash' created successfully!");
  } catch (err) {
    console.error("Error connecting to MariaDB:", err);
  } finally {
    if (conn) conn.end();
  }
}

createDatabase();
