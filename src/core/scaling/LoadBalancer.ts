import { EventEmitter } from 'events';
import { createLogger } from '../logging/logger';
import * as http from 'http';

const logger = createLogger({ module: 'LoadBalancer' });

export interface Backend {
  id: string;
  host: string;
  port: number;
  weight: number;
  healthy: boolean;
  activeConnections: number;
  totalRequests: number;
  failedRequests: number;
  lastHealthCheck: Date | null;
}

export type LoadBalancingStrategy = 'round-robin' | 'least-connections' | 'weighted' | 'ip-hash';

export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy;
  healthCheckInterval: number;
  healthCheckPath: string;
  maxRetries: number;
}

/**
 * Load Balancer for distributing requests across multiple backends
 */
export class LoadBalancer extends EventEmitter {
  private backends: Map<string, Backend> = new Map();
  private config: LoadBalancerConfig;
  private currentIndex: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: LoadBalancerConfig) {
    super();
    this.config = config;
  }

  /**
   * Register a backend server
   */
  registerBackend(backend: Omit<Backend, 'healthy' | 'activeConnections' | 'totalRequests' | 'failedRequests' | 'lastHealthCheck'>): void {
    const fullBackend: Backend = {
      ...backend,
      healthy: true,
      activeConnections: 0,
      totalRequests: 0,
      failedRequests: 0,
      lastHealthCheck: null
    };

    this.backends.set(backend.id, fullBackend);

    logger.info(`Backend registered`, {
      id: backend.id,
      host: backend.host,
      port: backend.port,
      weight: backend.weight
    });

    this.emit('backendRegistered', backend.id);
  }

  /**
   * Unregister a backend server
   */
  unregisterBackend(backendId: string): void {
    const backend = this.backends.get(backendId);

    if (backend && backend.activeConnections > 0) {
      logger.warn(`Unregistering backend with active connections`, {
        backendId,
        activeConnections: backend.activeConnections
      });
    }

    this.backends.delete(backendId);

    logger.info(`Backend unregistered: ${backendId}`);
    this.emit('backendUnregistered', backendId);
  }

  /**
   * Get next backend based on load balancing strategy
   */
  getNextBackend(clientIp?: string): Backend | null {
    const healthyBackends = this.getHealthyBackends();

    if (healthyBackends.length === 0) {
      logger.error('No healthy backends available');
      return null;
    }

    let selected: Backend;

    switch (this.config.strategy) {
      case 'round-robin':
        selected = this.roundRobin(healthyBackends);
        break;

      case 'least-connections':
        selected = this.leastConnections(healthyBackends);
        break;

      case 'weighted':
        selected = this.weighted(healthyBackends);
        break;

      case 'ip-hash':
        selected = this.ipHash(healthyBackends, clientIp || '');
        break;

      default:
        selected = this.roundRobin(healthyBackends);
    }

    return selected;
  }

  /**
   * Round-robin selection
   */
  private roundRobin(backends: Backend[]): Backend {
    const backend = backends[this.currentIndex % backends.length];
    this.currentIndex++;
    return backend;
  }

  /**
   * Least connections selection
   */
  private leastConnections(backends: Backend[]): Backend {
    return backends.reduce((min, backend) =>
      backend.activeConnections < min.activeConnections ? backend : min
    );
  }

  /**
   * Weighted selection
   */
  private weighted(backends: Backend[]): Backend {
    const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const backend of backends) {
      random -= backend.weight;
      if (random <= 0) {
        return backend;
      }
    }

    return backends[0];
  }

  /**
   * IP hash selection (sticky sessions)
   */
  private ipHash(backends: Backend[], clientIp: string): Backend {
    const hash = this.simpleHash(clientIp);
    const index = hash % backends.length;
    return backends[index];
  }

  /**
   * Simple hash function for IP addresses
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  /**
   * Get all healthy backends
   */
  private getHealthyBackends(): Backend[] {
    return Array.from(this.backends.values()).filter(b => b.healthy);
  }

  /**
   * Record request start
   */
  recordRequestStart(backendId: string): void {
    const backend = this.backends.get(backendId);
    if (backend) {
      backend.activeConnections++;
      backend.totalRequests++;
    }
  }

  /**
   * Record request completion
   */
  recordRequestComplete(backendId: string, success: boolean): void {
    const backend = this.backends.get(backendId);
    if (backend) {
      backend.activeConnections = Math.max(0, backend.activeConnections - 1);

      if (!success) {
        backend.failedRequests++;
      }
    }
  }

  /**
   * Start health checks
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      logger.warn('Health checks already running');
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error('Health check error', error);
      });
    }, this.config.healthCheckInterval);

    logger.info('Health checks started', {
      interval: this.config.healthCheckInterval,
      path: this.config.healthCheckPath
    });
  }

  /**
   * Stop health checks
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Health checks stopped');
    }
  }

  /**
   * Perform health checks on all backends
   */
  private async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.backends.values()).map(backend =>
      this.checkBackendHealth(backend)
    );

    await Promise.allSettled(promises);
  }

  /**
   * Check health of a single backend
   */
  private async checkBackendHealth(backend: Backend): Promise<void> {
    const options: http.RequestOptions = {
      hostname: backend.host,
      port: backend.port,
      path: this.config.healthCheckPath,
      method: 'GET',
      timeout: 5000
    };

    return new Promise((resolve) => {
      const req = http.request(options, (res) => {
        const wasHealthy = backend.healthy;
        const isHealthy = res.statusCode === 200;

        backend.healthy = isHealthy;
        backend.lastHealthCheck = new Date();

        if (wasHealthy !== isHealthy) {
          if (isHealthy) {
            logger.info(`Backend ${backend.id} is now healthy`);
            this.emit('backendHealthy', backend.id);
          } else {
            logger.warn(`Backend ${backend.id} is now unhealthy`);
            this.emit('backendUnhealthy', backend.id);
          }
        }

        resolve();
      });

      req.on('error', () => {
        const wasHealthy = backend.healthy;
        backend.healthy = false;
        backend.lastHealthCheck = new Date();

        if (wasHealthy) {
          logger.warn(`Backend ${backend.id} health check failed`);
          this.emit('backendUnhealthy', backend.id);
        }

        resolve();
      });

      req.on('timeout', () => {
        req.destroy();
        backend.healthy = false;
        backend.lastHealthCheck = new Date();
        resolve();
      });

      req.end();
    });
  }

  /**
   * Get backend by ID
   */
  getBackend(backendId: string): Backend | undefined {
    return this.backends.get(backendId);
  }

  /**
   * Get all backends
   */
  getAllBackends(): Backend[] {
    return Array.from(this.backends.values());
  }

  /**
   * Get load balancer statistics
   */
  getStats() {
    const backends = this.getAllBackends();

    return {
      totalBackends: backends.length,
      healthyBackends: backends.filter(b => b.healthy).length,
      unhealthyBackends: backends.filter(b => !b.healthy).length,
      totalRequests: backends.reduce((sum, b) => sum + b.totalRequests, 0),
      failedRequests: backends.reduce((sum, b) => sum + b.failedRequests, 0),
      activeConnections: backends.reduce((sum, b) => sum + b.activeConnections, 0),
      backends: backends.map(b => ({
        id: b.id,
        host: b.host,
        port: b.port,
        healthy: b.healthy,
        activeConnections: b.activeConnections,
        totalRequests: b.totalRequests,
        failedRequests: b.failedRequests,
        successRate: b.totalRequests > 0
          ? ((b.totalRequests - b.failedRequests) / b.totalRequests * 100).toFixed(2)
          : '0.00'
      }))
    };
  }

  /**
   * Shutdown load balancer
   */
  shutdown(): void {
    this.stopHealthChecks();
    this.backends.clear();
    logger.info('Load balancer shut down');
  }
}

// Singleton instance
let loadBalancer: LoadBalancer | null = null;

export function createLoadBalancer(config: LoadBalancerConfig): LoadBalancer {
  loadBalancer = new LoadBalancer(config);
  return loadBalancer;
}

export function getLoadBalancer(): LoadBalancer {
  if (!loadBalancer) {
    throw new Error('Load balancer not initialized');
  }
  return loadBalancer;
}
