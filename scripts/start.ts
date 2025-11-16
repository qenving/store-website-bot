import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';

const processes: ChildProcess[] = [];

function log(service: string, message: string): void {
  console.log(`[${service}] ${message}`);
}

function startService(name: string, command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    log(name, `Starting ${name}...`);

    const proc = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      env: { ...process.env }
    });

    processes.push(proc);

    proc.on('error', (error) => {
      log(name, `Error: ${error.message}`);
      reject(error);
    });

    proc.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        log(name, `Exited with code ${code}`);
      }
    });

    setTimeout(() => {
      log(name, 'Started');
      resolve();
    }, 2000);
  });
}

function startElectron(): void {
  log('Dashboard', 'Starting Electron dashboard...');

  const electronPath = path.join(process.cwd(), 'node_modules', '.bin', 'electron');
  const mainPath = path.join(process.cwd(), 'dist', 'dashboard', 'main', 'electronMain.js');

  const proc = spawn(electronPath, [mainPath], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env }
  });

  processes.push(proc);

  proc.on('exit', () => {
    log('Dashboard', 'Electron closed');
    cleanup();
  });
}

function cleanup(): void {
  log('System', 'Shutting down all services...');

  processes.forEach((proc) => {
    try {
      proc.kill();
    } catch (error) {
      // Ignore errors during cleanup
    }
  });

  setTimeout(() => {
    process.exit(0);
  }, 1000);
}

async function main(): Promise<void> {
  try {
    log('System', 'Building TypeScript...');
    await startService('Build', 'npm', ['run', 'build']);

    log('System', 'Starting all services...');

    await startService('API', 'node', [
      path.join(process.cwd(), 'dist', 'api', 'index.js')
    ]);

    await startService('Socket', 'node', [
      '-e',
      `require('${path.join(process.cwd(), 'dist', 'realtime', 'socketServer.js')}').startRealtimeServer()`
    ]);

    await startService('Bot', 'node', [
      '-e',
      `require('${path.join(process.cwd(), 'dist', 'bot', 'index.js')}').startDiscordBot()`
    ]);

    log('System', 'All services started');
    log('System', 'Launching dashboard...');

    setTimeout(() => {
      startElectron();
    }, 2000);
  } catch (error) {
    log('System', `Failed to start services: ${error}`);
    cleanup();
  }
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

main();
