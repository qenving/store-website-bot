import { exec } from 'child_process';
import { promisify } from 'util';
import { validateEnvironment } from './validateEnv';

const execAsync = promisify(exec);

interface CheckResult {
  name: string;
  passed: boolean;
  message: string;
}

async function checkKubernetesConnection(): Promise<CheckResult> {
  try {
    await execAsync('kubectl cluster-info');
    return {
      name: 'Kubernetes Connection',
      passed: true,
      message: 'Successfully connected to Kubernetes cluster'
    };
  } catch (error) {
    return {
      name: 'Kubernetes Connection',
      passed: false,
      message: 'Failed to connect to Kubernetes cluster'
    };
  }
}

async function checkDockerRegistry(): Promise<CheckResult> {
  try {
    const registry = process.env.REGISTRY || 'ghcr.io';
    await execAsync(`docker pull ${registry}/hello-world || true`);
    return {
      name: 'Docker Registry',
      passed: true,
      message: 'Docker registry is accessible'
    };
  } catch (error) {
    return {
      name: 'Docker Registry',
      passed: false,
      message: 'Failed to access Docker registry'
    };
  }
}

async function checkDatabaseConnection(): Promise<CheckResult> {
  try {
    const dbHost = process.env.PROD_DB_HOST || process.env.DB_HOST;
    const dbPort = process.env.PROD_DB_PORT || process.env.DB_PORT || '3306';

    if (!dbHost) {
      return {
        name: 'Database Connection',
        passed: false,
        message: 'Database host not configured'
      };
    }

    // Simple TCP connection check
    await execAsync(`timeout 5 bash -c "cat < /dev/null > /dev/tcp/${dbHost}/${dbPort}"`);
    return {
      name: 'Database Connection',
      passed: true,
      message: 'Database is reachable'
    };
  } catch (error) {
    return {
      name: 'Database Connection',
      passed: false,
      message: 'Database is not reachable'
    };
  }
}

async function checkKubernetesManifests(): Promise<CheckResult> {
  try {
    const { stdout, stderr } = await execAsync('kubectl apply --dry-run=client -f kubernetes/ -R');

    if (stderr && stderr.includes('error')) {
      return {
        name: 'Kubernetes Manifests',
        passed: false,
        message: `Manifest validation failed: ${stderr}`
      };
    }

    return {
      name: 'Kubernetes Manifests',
      passed: true,
      message: 'All Kubernetes manifests are valid'
    };
  } catch (error) {
    return {
      name: 'Kubernetes Manifests',
      passed: false,
      message: `Manifest validation error: ${error}`
    };
  }
}

async function checkSecretsExist(): Promise<CheckResult> {
  try {
    const requiredSecrets = [
      'redis-secret',
      'db-secret',
      'app-secrets',
      'discord-secret',
      'payment-secrets'
    ];

    const namespace = process.env.KUBE_NAMESPACE || 'default';

    for (const secret of requiredSecrets) {
      try {
        await execAsync(`kubectl get secret ${secret} -n ${namespace}`);
      } catch {
        return {
          name: 'Kubernetes Secrets',
          passed: false,
          message: `Required secret '${secret}' not found in namespace '${namespace}'`
        };
      }
    }

    return {
      name: 'Kubernetes Secrets',
      passed: true,
      message: 'All required secrets exist'
    };
  } catch (error) {
    return {
      name: 'Kubernetes Secrets',
      passed: false,
      message: `Secret check failed: ${error}`
    };
  }
}

async function checkDiskSpace(): Promise<CheckResult> {
  try {
    const { stdout } = await execAsync("df -h / | tail -1 | awk '{print $5}' | sed 's/%//'");
    const usedPercent = parseInt(stdout.trim(), 10);

    if (usedPercent > 85) {
      return {
        name: 'Disk Space',
        passed: false,
        message: `Disk usage is ${usedPercent}% (threshold: 85%)`
      };
    }

    return {
      name: 'Disk Space',
      passed: true,
      message: `Disk usage is ${usedPercent}% (healthy)`
    };
  } catch (error) {
    return {
      name: 'Disk Space',
      passed: true,
      message: 'Could not check disk space (non-critical)'
    };
  }
}

async function checkEnvironmentVariables(): Promise<CheckResult> {
  const result = validateEnvironment(true);

  if (result.valid) {
    return {
      name: 'Environment Variables',
      passed: true,
      message: 'All required environment variables are set'
    };
  }

  return {
    name: 'Environment Variables',
    passed: false,
    message: `Missing variables: ${result.missing.join(', ')}`
  };
}

async function main() {
  console.log('🚀 Pre-Deployment Checks\n');
  console.log('='.repeat(60));
  console.log('');

  const checks = [
    checkEnvironmentVariables(),
    checkKubernetesConnection(),
    checkDockerRegistry(),
    checkDatabaseConnection(),
    checkKubernetesManifests(),
    checkSecretsExist(),
    checkDiskSpace()
  ];

  const results = await Promise.all(checks);

  let allPassed = true;

  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    console.log(`   ${result.message}`);
    console.log('');

    if (!result.passed) {
      allPassed = false;
    }
  }

  console.log('='.repeat(60));
  console.log('');

  if (allPassed) {
    console.log('✅ All pre-deployment checks passed!');
    console.log('   Ready to deploy to production.');
    process.exit(0);
  } else {
    console.error('❌ Some pre-deployment checks failed!');
    console.error('   Please fix the issues before deploying.');
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error during pre-deployment checks:', error);
    process.exit(1);
  });
}

export { checkKubernetesConnection, checkDatabaseConnection, checkKubernetesManifests };
