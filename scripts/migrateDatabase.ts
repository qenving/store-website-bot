import { createConnection, Connection } from 'mysql2/promise';

async function runMigrations(): Promise<void> {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'discord_store_prod',
    multipleStatements: true
  };

  let connection: Connection | null = null;

  try {
    console.log('🗄️  Connecting to database...');
    connection = await createConnection(config);
    console.log('✅ Connected to database');

    console.log('🔄 Running migrations...');

    // Create migrations table if not exists
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Check which migrations have been run
    const [rows] = await connection.execute<any[]>('SELECT migration_name FROM migrations');
    const executedMigrations = new Set(rows.map((row: any) => row.migration_name));

    const migrations = [
      {
        name: '001_initial_schema',
        sql: `
          -- Initial schema migration
          CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(36) PRIMARY KEY,
            discord_id VARCHAR(20) UNIQUE NOT NULL,
            email VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          );
        `
      },
      {
        name: '002_security_tables',
        sql: `
          -- Security-related tables from FASE 9
          CREATE TABLE IF NOT EXISTS admin_sessions (
            id VARCHAR(36) PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            user_email VARCHAR(255) NOT NULL,
            token_hash VARCHAR(255) NOT NULL,
            device_fingerprint VARCHAR(64),
            ip_address VARCHAR(45),
            user_agent TEXT,
            is_2fa_verified BOOLEAN DEFAULT FALSE,
            expires_at TIMESTAMP NOT NULL,
            last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_token_hash (token_hash),
            INDEX idx_expires_at (expires_at)
          );

          CREATE TABLE IF NOT EXISTS totp_secrets (
            user_id VARCHAR(36) PRIMARY KEY,
            secret VARCHAR(255) NOT NULL,
            enabled BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS totp_backup_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            code_hash VARCHAR(255) NOT NULL,
            used BOOLEAN DEFAULT FALSE,
            used_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id)
          );

          CREATE TABLE IF NOT EXISTS key_rotation_history (
            id INT AUTO_INCREMENT PRIMARY KEY,
            key_type ENUM('jwt', 'session', 'gateway_stripe', 'gateway_paypal', 'gateway_coinbase') NOT NULL,
            rotated_by_admin_id VARCHAR(36) NOT NULL,
            rotated_by_admin_email VARCHAR(255) NOT NULL,
            grace_period_days INT DEFAULT 0,
            expires_previous_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_key_type (key_type),
            INDEX idx_created_at (created_at)
          );

          CREATE TABLE IF NOT EXISTS security_logs (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_type VARCHAR(50) NOT NULL,
            severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
            user_id VARCHAR(36),
            ip_address VARCHAR(45),
            user_agent TEXT,
            description TEXT,
            metadata JSON,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_event_type (event_type),
            INDEX idx_severity (severity),
            INDEX idx_user_id (user_id),
            INDEX idx_created_at (created_at)
          );

          CREATE TABLE IF NOT EXISTS ip_allowlist (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id VARCHAR(36) NOT NULL,
            ip_address VARCHAR(45) NOT NULL,
            description VARCHAR(255),
            enabled BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_user_id (user_id),
            INDEX idx_enabled (enabled)
          );
        `
      }
    ];

    for (const migration of migrations) {
      if (executedMigrations.has(migration.name)) {
        console.log(`⏭️  Skipping ${migration.name} (already executed)`);
        continue;
      }

      console.log(`⚙️  Running migration: ${migration.name}`);
      await connection.execute(migration.sql);
      await connection.execute('INSERT INTO migrations (migration_name) VALUES (?)', [migration.name]);
      console.log(`✅ Completed migration: ${migration.name}`);
    }

    console.log('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Database migration completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('Database migration failed:', error);
      process.exit(1);
    });
}

export { runMigrations };
