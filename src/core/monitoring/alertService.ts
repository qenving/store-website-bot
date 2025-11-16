import { createLogger } from '../logging/logger';
import * as nodemailer from 'nodemailer';

const logger = createLogger({ module: 'AlertService' });

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

export enum AlertChannel {
  DISCORD = 'discord',
  SLACK = 'slack',
  EMAIL = 'email'
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertConfig {
  enabled: boolean;
  channels: AlertChannel[];
  discordWebhook?: string;
  slackWebhook?: string;
  emailConfig?: {
    host: string;
    port: number;
    secure: boolean;
    auth: {
      user: string;
      pass: string;
    };
    from: string;
    to: string[];
  };
  thresholds: {
    gatewayDownMinutes: number;
    queueFailedJobs: number;
    reconciliationMismatches: number;
    apiLatencyMs: number;
  };
}

const DEFAULT_CONFIG: AlertConfig = {
  enabled: true,
  channels: [AlertChannel.DISCORD],
  thresholds: {
    gatewayDownMinutes: 5,
    queueFailedJobs: 50,
    reconciliationMismatches: 10,
    apiLatencyMs: 5000
  }
};

export class AlertService {
  private config: AlertConfig;
  private alertHistory: Alert[] = [];
  private maxHistory = 1000;
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.config = DEFAULT_CONFIG;
  }

  async initialize(config?: Partial<AlertConfig>): Promise<void> {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.emailConfig && this.config.channels.includes(AlertChannel.EMAIL)) {
      this.emailTransporter = nodemailer.createTransporter(this.config.emailConfig);
      logger.info('Email transporter initialized');
    }

    logger.info('Alert service initialized', {
      enabled: this.config.enabled,
      channels: this.config.channels
    });
  }

  async sendAlert(
    title: string,
    message: string,
    severity: AlertSeverity,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.config.enabled) {
      logger.debug('Alerts disabled, skipping', { title });
      return;
    }

    const alert: Alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      title,
      message,
      severity,
      timestamp: new Date(),
      metadata
    };

    this.recordAlert(alert);

    logger.info('Sending alert', {
      title,
      severity,
      channels: this.config.channels
    });

    const promises: Promise<void>[] = [];

    if (this.config.channels.includes(AlertChannel.DISCORD) && this.config.discordWebhook) {
      promises.push(this.sendDiscordAlert(alert));
    }

    if (this.config.channels.includes(AlertChannel.SLACK) && this.config.slackWebhook) {
      promises.push(this.sendSlackAlert(alert));
    }

    if (this.config.channels.includes(AlertChannel.EMAIL) && this.emailTransporter) {
      promises.push(this.sendEmailAlert(alert));
    }

    await Promise.allSettled(promises);
  }

  private async sendDiscordAlert(alert: Alert): Promise<void> {
    if (!this.config.discordWebhook) return;

    try {
      const color = this.getSeverityColor(alert.severity);
      const emoji = this.getSeverityEmoji(alert.severity);

      const payload = {
        embeds: [
          {
            title: `${emoji} ${alert.title}`,
            description: alert.message,
            color,
            timestamp: alert.timestamp.toISOString(),
            fields: alert.metadata
              ? Object.entries(alert.metadata).map(([key, value]) => ({
                  name: key,
                  value: String(value),
                  inline: true
                }))
              : [],
            footer: {
              text: `Severity: ${alert.severity.toUpperCase()}`
            }
          }
        ]
      };

      const response = await fetch(this.config.discordWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.statusText}`);
      }

      logger.debug('Discord alert sent', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send Discord alert', error);
    }
  }

  private async sendSlackAlert(alert: Alert): Promise<void> {
    if (!this.config.slackWebhook) return;

    try {
      const emoji = this.getSeverityEmoji(alert.severity);

      const payload = {
        text: `${emoji} *${alert.title}*`,
        attachments: [
          {
            color: this.getSeverityColorHex(alert.severity),
            text: alert.message,
            fields: alert.metadata
              ? Object.entries(alert.metadata).map(([key, value]) => ({
                  title: key,
                  value: String(value),
                  short: true
                }))
              : [],
            footer: `Severity: ${alert.severity.toUpperCase()}`,
            ts: Math.floor(alert.timestamp.getTime() / 1000)
          }
        ]
      };

      const response = await fetch(this.config.slackWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.statusText}`);
      }

      logger.debug('Slack alert sent', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send Slack alert', error);
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<void> {
    if (!this.emailTransporter || !this.config.emailConfig) return;

    try {
      const html = `
        <h2>${alert.title}</h2>
        <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
        <p>${alert.message}</p>
        ${
          alert.metadata
            ? `
          <h3>Details:</h3>
          <ul>
            ${Object.entries(alert.metadata)
              .map(([key, value]) => `<li><strong>${key}:</strong> ${value}</li>`)
              .join('')}
          </ul>
        `
            : ''
        }
        <p><em>Timestamp: ${alert.timestamp.toISOString()}</em></p>
      `;

      await this.emailTransporter.sendMail({
        from: this.config.emailConfig.from,
        to: this.config.emailConfig.to.join(', '),
        subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
        html
      });

      logger.debug('Email alert sent', { alertId: alert.id });
    } catch (error) {
      logger.error('Failed to send email alert', error);
    }
  }

  private recordAlert(alert: Alert): void {
    this.alertHistory.push(alert);

    if (this.alertHistory.length > this.maxHistory) {
      this.alertHistory.shift();
    }
  }

  private getSeverityColor(severity: AlertSeverity): number {
    const colors = {
      [AlertSeverity.INFO]: 0x3498db, // Blue
      [AlertSeverity.WARNING]: 0xf39c12, // Orange
      [AlertSeverity.ERROR]: 0xe74c3c, // Red
      [AlertSeverity.CRITICAL]: 0x992d22 // Dark red
    };
    return colors[severity];
  }

  private getSeverityColorHex(severity: AlertSeverity): string {
    const colors = {
      [AlertSeverity.INFO]: '#3498db',
      [AlertSeverity.WARNING]: '#f39c12',
      [AlertSeverity.ERROR]: '#e74c3c',
      [AlertSeverity.CRITICAL]: '#992d22'
    };
    return colors[severity];
  }

  private getSeverityEmoji(severity: AlertSeverity): string {
    const emojis = {
      [AlertSeverity.INFO]: 'ℹ️',
      [AlertSeverity.WARNING]: '⚠️',
      [AlertSeverity.ERROR]: '❌',
      [AlertSeverity.CRITICAL]: '🚨'
    };
    return emojis[severity];
  }

  getAlertHistory(last: number = 100): Alert[] {
    return this.alertHistory.slice(-last);
  }

  getConfig(): AlertConfig {
    return { ...this.config };
  }

  async updateConfig(config: Partial<AlertConfig>): Promise<void> {
    this.config = { ...this.config, ...config };

    if (config.emailConfig && this.config.channels.includes(AlertChannel.EMAIL)) {
      this.emailTransporter = nodemailer.createTransporter(this.config.emailConfig);
    }

    logger.info('Alert config updated', { config: this.config });
  }
}

export const alertService = new AlertService();
