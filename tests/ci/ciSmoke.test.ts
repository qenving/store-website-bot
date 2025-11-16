import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

describe('CI Smoke Tests', () => {
  describe('Build Artifacts', () => {
    it('should have dist directory', () => {
      const distPath = path.join(process.cwd(), 'dist');
      expect(fs.existsSync(distPath)).toBe(true);
    });

    it('should have all service builds', () => {
      const services = ['api', 'bot', 'worker', 'store', 'gateway'];

      for (const service of services) {
        const servicePath = path.join(process.cwd(), 'dist', service);
        expect(fs.existsSync(servicePath)).toBe(true);
      }
    });

    it('should have index.js for each service', () => {
      const services = ['api', 'bot', 'worker', 'gateway'];

      for (const service of services) {
        const indexPath = path.join(process.cwd(), 'dist', service, 'index.js');
        expect(fs.existsSync(indexPath)).toBe(true);
      }
    });
  });

  describe('Configuration Files', () => {
    it('should have package.json', () => {
      const packagePath = path.join(process.cwd(), 'package.json');
      expect(fs.existsSync(packagePath)).toBe(true);

      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      expect(packageJson.name).toBeDefined();
      expect(packageJson.version).toBeDefined();
    });

    it('should have tsconfig.json', () => {
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      expect(fs.existsSync(tsconfigPath)).toBe(true);
    });

    it('should have .env.example', () => {
      const envExamplePath = path.join(process.cwd(), '.env.example');
      expect(fs.existsSync(envExamplePath)).toBe(true);
    });
  });

  describe('Docker Files', () => {
    it('should have all Dockerfiles', () => {
      const dockerfiles = [
        'docker/api.Dockerfile',
        'docker/bot.Dockerfile',
        'docker/worker.Dockerfile',
        'docker/store.Dockerfile',
        'docker/gateway.Dockerfile'
      ];

      for (const dockerfile of dockerfiles) {
        const dockerfilePath = path.join(process.cwd(), dockerfile);
        expect(fs.existsSync(dockerfilePath)).toBe(true);
      }
    });

    it('should have docker-compose.prod.yml', () => {
      const composePath = path.join(process.cwd(), 'docker/docker-compose.prod.yml');
      expect(fs.existsSync(composePath)).toBe(true);
    });
  });

  describe('Kubernetes Manifests', () => {
    it('should have all deployment manifests', () => {
      const deployments = [
        'kubernetes/api/deployment.yaml',
        'kubernetes/bot/deployment.yaml',
        'kubernetes/worker/deployment.yaml',
        'kubernetes/store/deployment.yaml',
        'kubernetes/gateway/deployment.yaml'
      ];

      for (const deployment of deployments) {
        const deploymentPath = path.join(process.cwd(), deployment);
        expect(fs.existsSync(deploymentPath)).toBe(true);
      }
    });

    it('should have all service manifests', () => {
      const services = [
        'kubernetes/api/service.yaml',
        'kubernetes/bot/service.yaml',
        'kubernetes/worker/service.yaml',
        'kubernetes/store/service.yaml',
        'kubernetes/gateway/service.yaml',
        'kubernetes/redis/service.yaml'
      ];

      for (const service of services) {
        const servicePath = path.join(process.cwd(), service);
        expect(fs.existsSync(servicePath)).toBe(true);
      }
    });

    it('should have ingress and HPA', () => {
      const files = ['kubernetes/ingress.yaml', 'kubernetes/hpa.yaml'];

      for (const file of files) {
        const filePath = path.join(process.cwd(), file);
        expect(fs.existsSync(filePath)).toBe(true);
      }
    });
  });

  describe('GitHub Workflows', () => {
    it('should have all workflow files', () => {
      const workflows = [
        '.github/workflows/ci.yml',
        '.github/workflows/cd.yml',
        '.github/workflows/release.yml',
        '.github/workflows/security.yml',
        '.github/workflows/nightly.yml'
      ];

      for (const workflow of workflows) {
        const workflowPath = path.join(process.cwd(), workflow);
        expect(fs.existsSync(workflowPath)).toBe(true);
      }
    });
  });

  describe('Scripts', () => {
    it('should have all deployment scripts', () => {
      const scripts = [
        'scripts/validateEnv.ts',
        'scripts/preDeployCheck.ts',
        'scripts/rollback.ts',
        'scripts/tagVersion.ts',
        'scripts/notifyRelease.ts',
        'scripts/migrateDatabase.ts'
      ];

      for (const script of scripts) {
        const scriptPath = path.join(process.cwd(), script);
        expect(fs.existsSync(scriptPath)).toBe(true);
      }
    });
  });

  describe('Dependencies', () => {
    it('should have node_modules', () => {
      const nodeModulesPath = path.join(process.cwd(), 'node_modules');
      expect(fs.existsSync(nodeModulesPath)).toBe(true);
    });

    it('should have required dependencies installed', () => {
      const packageJson = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8')
      );

      const requiredDeps = [
        'discord.js',
        'express',
        'mysql2',
        'redis',
        'socket.io'
      ];

      for (const dep of requiredDeps) {
        expect(packageJson.dependencies[dep]).toBeDefined();
      }
    });
  });

  describe('Source Code Structure', () => {
    it('should have src directory with all modules', () => {
      const modules = ['api', 'bot', 'core', 'dashboard', 'worker'];

      for (const module of modules) {
        const modulePath = path.join(process.cwd(), 'src', module);
        expect(fs.existsSync(modulePath)).toBe(true);
      }
    });

    it('should have security module', () => {
      const securityPath = path.join(process.cwd(), 'src/core/security');
      expect(fs.existsSync(securityPath)).toBe(true);
    });
  });
});
