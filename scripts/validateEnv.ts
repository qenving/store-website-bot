import * as fs from 'fs';
import * as path from 'path';

interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  errors: string[];
}

const REQUIRED_ENV_VARS = [
  'NODE_ENV',
  'DISCORD_TOKEN',
  'DISCORD_CLIENT_ID',
  'DISCORD_GUILD_ID',
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'REDIS_HOST',
  'REDIS_PORT',
  'JWT_SECRET',
  'SESSION_SIGNING_KEY',
  'ENCRYPTION_KEY',
  'API_PORT',
  'GATEWAY_PORT'
];

const PRODUCTION_ENV_VARS = [
  ...REQUIRED_ENV_VARS,
  'STRIPE_SECRET_KEY',
  'PAYPAL_CLIENT_ID',
  'PAYPAL_CLIENT_SECRET',
  'COINBASE_API_KEY',
  'COINBASE_WEBHOOK_SECRET'
];

function validateEnvironment(isProduction: boolean = false): EnvValidationResult {
  const result: EnvValidationResult = {
    valid: true,
    missing: [],
    errors: []
  };

  const requiredVars = isProduction ? PRODUCTION_ENV_VARS : REQUIRED_ENV_VARS;

  for (const envVar of requiredVars) {
    if (!process.env[envVar]) {
      result.valid = false;
      result.missing.push(envVar);
    }
  }

  // Validate JWT_SECRET length
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    result.valid = false;
    result.errors.push('JWT_SECRET must be at least 32 characters long');
  }

  // Validate encryption key
  if (process.env.ENCRYPTION_KEY && process.env.ENCRYPTION_KEY.length < 32) {
    result.valid = false;
    result.errors.push('ENCRYPTION_KEY must be at least 32 characters long');
  }

  // Validate Discord token format
  if (process.env.DISCORD_TOKEN && !process.env.DISCORD_TOKEN.includes('.')) {
    result.valid = false;
    result.errors.push('DISCORD_TOKEN appears to be invalid');
  }

  // Validate port numbers
  const ports = ['DB_PORT', 'REDIS_PORT', 'API_PORT', 'GATEWAY_PORT'];
  for (const port of ports) {
    if (process.env[port]) {
      const portNum = parseInt(process.env[port], 10);
      if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
        result.valid = false;
        result.errors.push(`${port} must be a valid port number (1-65535)`);
      }
    }
  }

  return result;
}

function validateEnvSchema(): boolean {
  const examplePath = path.join(process.cwd(), '.env.example');

  if (!fs.existsSync(examplePath)) {
    console.warn('Warning: .env.example file not found');
    return true;
  }

  const exampleContent = fs.readFileSync(examplePath, 'utf-8');
  const exampleVars = exampleContent
    .split('\n')
    .filter(line => line.trim() && !line.startsWith('#'))
    .map(line => line.split('=')[0].trim());

  const allVarsPresent = exampleVars.every(varName =>
    REQUIRED_ENV_VARS.includes(varName) || PRODUCTION_ENV_VARS.includes(varName)
  );

  if (!allVarsPresent) {
    console.warn('Warning: .env.example contains variables not in validation schema');
  }

  return true;
}

async function main() {
  console.log('🔍 Validating environment variables...\n');

  const isProduction = process.env.NODE_ENV === 'production' ||
                       process.argv.includes('--production') ||
                       process.argv.includes('--prod');

  const isProdValidation = process.argv.includes('--validate-prod');

  validateEnvSchema();

  const result = validateEnvironment(isProduction || isProdValidation);

  if (result.missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    result.missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('');
  }

  if (result.errors.length > 0) {
    console.error('❌ Environment validation errors:');
    result.errors.forEach(error => {
      console.error(`   - ${error}`);
    });
    console.error('');
  }

  if (result.valid) {
    console.log('✅ Environment validation passed!');
    console.log(`   Mode: ${isProduction || isProdValidation ? 'PRODUCTION' : 'DEVELOPMENT'}`);
    console.log(`   Variables validated: ${isProduction || isProdValidation ? PRODUCTION_ENV_VARS.length : REQUIRED_ENV_VARS.length}`);
    process.exit(0);
  } else {
    console.error('❌ Environment validation failed!');
    console.error(`   Missing variables: ${result.missing.length}`);
    console.error(`   Validation errors: ${result.errors.length}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error during environment validation:', error);
    process.exit(1);
  });
}

export { validateEnvironment, validateEnvSchema };
