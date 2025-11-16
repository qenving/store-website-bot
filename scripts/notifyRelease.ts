import fetch from 'node-fetch';
import * as fs from 'fs';
import * as path from 'path';

interface ReleaseNotification {
  version: string;
  releaseUrl: string;
  changelog?: string;
  releaseType: 'stable' | 'beta' | 'alpha';
  environment?: string;
}

async function sendDiscordNotification(
  webhookUrl: string,
  notification: ReleaseNotification
): Promise<void> {
  const emoji = notification.releaseType === 'stable' ? '🚀' : notification.releaseType === 'beta' ? '🧪' : '⚗️';

  const embed = {
    title: `${emoji} New Release: v${notification.version}`,
    description: notification.changelog || 'A new release has been published.',
    color: notification.releaseType === 'stable' ? 0x00ff00 : notification.releaseType === 'beta' ? 0xffaa00 : 0xff6600,
    fields: [
      {
        name: 'Version',
        value: `v${notification.version}`,
        inline: true
      },
      {
        name: 'Release Type',
        value: notification.releaseType.toUpperCase(),
        inline: true
      },
      {
        name: 'Download',
        value: `[View Release](${notification.releaseUrl})`,
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Discord Store Bot - Release Notification'
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log('✅ Discord notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send Discord notification:', error);
    throw error;
  }
}

async function sendDeploymentNotification(
  webhookUrl: string,
  notification: ReleaseNotification & { deploymentUrl?: string }
): Promise<void> {
  const embed = {
    title: `🚢 Deployment: v${notification.version} to ${notification.environment?.toUpperCase() || 'PRODUCTION'}`,
    description: 'A new version has been deployed successfully.',
    color: 0x0099ff,
    fields: [
      {
        name: 'Version',
        value: `v${notification.version}`,
        inline: true
      },
      {
        name: 'Environment',
        value: notification.environment?.toUpperCase() || 'PRODUCTION',
        inline: true
      },
      {
        name: 'Deployment Details',
        value: `[View Workflow](${notification.deploymentUrl || notification.releaseUrl})`,
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Discord Store Bot - Deployment Notification'
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log('✅ Deployment notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send deployment notification:', error);
    throw error;
  }
}

async function sendRollbackNotification(
  webhookUrl: string,
  deploymentId: string
): Promise<void> {
  const embed = {
    title: '⚠️ Deployment Rollback',
    description: 'A deployment has been automatically rolled back due to health check failures.',
    color: 0xff0000,
    fields: [
      {
        name: 'Deployment ID',
        value: deploymentId,
        inline: false
      },
      {
        name: 'Action Required',
        value: 'Please investigate the deployment failure and fix the issues before redeploying.',
        inline: false
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Discord Store Bot - Rollback Notification'
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: '@here', embeds: [embed] })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log('✅ Rollback notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send rollback notification:', error);
    throw error;
  }
}

async function sendCINotification(
  webhookUrl: string,
  status: 'success' | 'failure',
  runUrl: string
): Promise<void> {
  const color = status === 'success' ? 0x00ff00 : 0xff0000;
  const emoji = status === 'success' ? '✅' : '❌';

  const embed = {
    title: `${emoji} CI Pipeline ${status === 'success' ? 'Passed' : 'Failed'}`,
    description: `The CI pipeline has ${status === 'success' ? 'completed successfully' : 'failed'}.`,
    color,
    fields: [
      {
        name: 'Status',
        value: status.toUpperCase(),
        inline: true
      },
      {
        name: 'Details',
        value: `[View Workflow](${runUrl})`,
        inline: true
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Discord Store Bot - CI Notification'
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log('✅ CI notification sent successfully');
  } catch (error) {
    console.error('❌ Failed to send CI notification:', error);
  }
}

async function sendNightlyReport(
  webhookUrl: string,
  summaryPath: string,
  runUrl: string
): Promise<void> {
  let summary = '';

  try {
    summary = fs.readFileSync(summaryPath, 'utf-8');
  } catch {
    summary = 'Nightly build report generated. Check the workflow for details.';
  }

  const embed = {
    title: '🌙 Nightly Build Report',
    description: summary.substring(0, 2000), // Discord embed description limit
    color: 0x5865f2,
    fields: [
      {
        name: 'Date',
        value: new Date().toISOString().split('T')[0],
        inline: true
      },
      {
        name: 'Full Report',
        value: `[View Workflow](${runUrl})`,
        inline: true
      }
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: 'Discord Store Bot - Nightly Build'
    }
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    });

    if (!response.ok) {
      throw new Error(`Discord webhook failed: ${response.statusText}`);
    }

    console.log('✅ Nightly report sent successfully');
  } catch (error) {
    console.error('❌ Failed to send nightly report:', error);
  }
}

async function main() {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;

  if (!webhookUrl) {
    console.error('❌ DISCORD_WEBHOOK_URL environment variable not set');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const notificationType = args[0];

  switch (notificationType) {
    case 'release':
      await sendDiscordNotification(webhookUrl, {
        version: process.env.RELEASE_VERSION || '0.0.0',
        releaseUrl: process.env.RELEASE_URL || '',
        releaseType: (process.env.RELEASE_TYPE as any) || 'stable'
      });
      break;

    case 'deploy':
      await sendDeploymentNotification(webhookUrl, {
        version: process.env.DEPLOYMENT_VERSION || '0.0.0',
        releaseUrl: process.env.GITHUB_RUN_URL || '',
        deploymentUrl: process.env.GITHUB_RUN_URL,
        environment: process.env.DEPLOYMENT_ENV || 'production',
        releaseType: 'stable'
      });
      break;

    case 'rollback':
      await sendRollbackNotification(webhookUrl, process.env.DEPLOYMENT_ID || 'unknown');
      break;

    case 'ci':
      await sendCINotification(
        webhookUrl,
        process.env.CI_STATUS === 'success' ? 'success' : 'failure',
        process.env.GITHUB_RUN_URL || ''
      );
      break;

    case 'nightly':
      await sendNightlyReport(
        webhookUrl,
        process.env.NIGHTLY_SUMMARY || 'nightly-summary.md',
        process.env.GITHUB_RUN_URL || ''
      );
      break;

    default:
      console.error(`Unknown notification type: ${notificationType}`);
      console.error('Usage: notifyRelease.ts <release|deploy|rollback|ci|nightly>');
      process.exit(1);
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Failed to send notification:', error);
    process.exit(1);
  });
}

export {
  sendDiscordNotification,
  sendDeploymentNotification,
  sendRollbackNotification,
  sendCINotification,
  sendNightlyReport
};
