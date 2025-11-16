import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface RollbackOptions {
  namespace?: string;
  deployment?: string;
  revision?: number;
}

async function rollbackDeployment(
  deploymentName: string,
  namespace: string = 'default',
  revision?: number
): Promise<void> {
  try {
    const revisionFlag = revision ? `--to-revision=${revision}` : '';
    const command = `kubectl rollout undo deployment/${deploymentName} -n ${namespace} ${revisionFlag}`;

    console.log(`Rolling back deployment: ${deploymentName}`);
    const { stdout, stderr } = await execAsync(command);

    if (stderr && !stderr.includes('rolled back')) {
      throw new Error(stderr);
    }

    console.log(`✅ Rollback initiated for ${deploymentName}`);
    console.log(stdout);

    // Wait for rollback to complete
    console.log(`Waiting for ${deploymentName} rollback to complete...`);
    await execAsync(`kubectl rollout status deployment/${deploymentName} -n ${namespace} --timeout=5m`);
    console.log(`✅ Rollback completed for ${deploymentName}`);
  } catch (error) {
    console.error(`❌ Failed to rollback ${deploymentName}:`, error);
    throw error;
  }
}

async function getDeploymentHistory(
  deploymentName: string,
  namespace: string = 'default'
): Promise<void> {
  try {
    const { stdout } = await execAsync(`kubectl rollout history deployment/${deploymentName} -n ${namespace}`);
    console.log(`\nDeployment history for ${deploymentName}:`);
    console.log(stdout);
  } catch (error) {
    console.error(`Failed to get deployment history:`, error);
  }
}

async function verifyDeployment(
  deploymentName: string,
  namespace: string = 'default'
): Promise<boolean> {
  try {
    const { stdout } = await execAsync(
      `kubectl get deployment ${deploymentName} -n ${namespace} -o jsonpath='{.status.conditions[?(@.type=="Available")].status}'`
    );

    return stdout.trim() === 'True';
  } catch (error) {
    console.error(`Failed to verify deployment ${deploymentName}:`, error);
    return false;
  }
}

async function scaleDeployment(
  deploymentName: string,
  replicas: number,
  namespace: string = 'default'
): Promise<void> {
  try {
    console.log(`Scaling ${deploymentName} to ${replicas} replicas...`);
    await execAsync(`kubectl scale deployment/${deploymentName} --replicas=${replicas} -n ${namespace}`);
    console.log(`✅ Scaled ${deploymentName} to ${replicas} replicas`);
  } catch (error) {
    console.error(`Failed to scale ${deploymentName}:`, error);
    throw error;
  }
}

async function performFullRollback(namespace: string = 'default', revision?: number): Promise<void> {
  const deployments = [
    'api-deployment',
    'bot-deployment',
    'worker-deployment',
    'store-deployment',
    'gateway-deployment'
  ];

  console.log('🔄 Initiating full system rollback...\n');
  console.log('='.repeat(60));
  console.log('');

  let failedRollbacks: string[] = [];

  for (const deployment of deployments) {
    try {
      await getDeploymentHistory(deployment, namespace);
      await rollbackDeployment(deployment, namespace, revision);

      // Verify the rollback was successful
      const isHealthy = await verifyDeployment(deployment, namespace);
      if (!isHealthy) {
        console.warn(`⚠️  Warning: ${deployment} may not be fully healthy after rollback`);
        failedRollbacks.push(deployment);
      }
    } catch (error) {
      console.error(`❌ Failed to rollback ${deployment}`);
      failedRollbacks.push(deployment);
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('');

  if (failedRollbacks.length === 0) {
    console.log('✅ Full system rollback completed successfully!');
  } else {
    console.error('❌ Rollback completed with errors:');
    failedRollbacks.forEach(dep => {
      console.error(`   - ${dep}`);
    });
    throw new Error('Some deployments failed to rollback');
  }
}

async function emergencyScaleDown(namespace: string = 'default'): Promise<void> {
  console.log('🚨 Emergency scale down initiated...\n');

  const deployments = [
    'api-deployment',
    'bot-deployment',
    'worker-deployment',
    'store-deployment',
    'gateway-deployment'
  ];

  for (const deployment of deployments) {
    try {
      await scaleDeployment(deployment, 0, namespace);
    } catch (error) {
      console.error(`Failed to scale down ${deployment}`);
    }
  }

  console.log('\n✅ Emergency scale down completed');
}

async function main() {
  const args = process.argv.slice(2);
  const namespace = process.env.KUBE_NAMESPACE || 'default';

  const options: RollbackOptions = {
    namespace,
    deployment: args.find(arg => arg.startsWith('--deployment='))?.split('=')[1],
    revision: parseInt(args.find(arg => arg.startsWith('--revision='))?.split('=')[1] || '', 10) || undefined
  };

  const isEmergency = args.includes('--emergency');
  const isScaleDown = args.includes('--scale-down');

  if (isEmergency && isScaleDown) {
    await emergencyScaleDown(namespace);
    return;
  }

  if (options.deployment) {
    // Rollback single deployment
    console.log(`Rolling back single deployment: ${options.deployment}\n`);
    await getDeploymentHistory(options.deployment, namespace);
    await rollbackDeployment(options.deployment, namespace, options.revision);

    const isHealthy = await verifyDeployment(options.deployment, namespace);
    if (isHealthy) {
      console.log('\n✅ Single deployment rollback completed successfully!');
    } else {
      console.error('\n❌ Deployment may not be fully healthy after rollback');
      process.exit(1);
    }
  } else {
    // Full system rollback
    await performFullRollback(namespace, options.revision);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Rollback failed:', error.message);
    process.exit(1);
  });
}

export { rollbackDeployment, performFullRollback, emergencyScaleDown };
