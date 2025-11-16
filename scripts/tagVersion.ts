import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

interface VersionInfo {
  major: number;
  minor: number;
  patch: number;
  full: string;
}

function parseVersion(version: string): VersionInfo {
  const match = version.match(/^v?(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    full: `${match[1]}.${match[2]}.${match[3]}`
  };
}

async function getCurrentVersion(): Promise<string> {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
    return packageJson.version;
  } catch (error) {
    console.error('Failed to read version from package.json');
    throw error;
  }
}

async function getLatestGitTag(): Promise<string | null> {
  try {
    const { stdout } = await execAsync('git describe --tags --abbrev=0 2>/dev/null || echo ""');
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
  const parsed = parseVersion(version);

  switch (type) {
    case 'major':
      parsed.major += 1;
      parsed.minor = 0;
      parsed.patch = 0;
      break;
    case 'minor':
      parsed.minor += 1;
      parsed.patch = 0;
      break;
    case 'patch':
      parsed.patch += 1;
      break;
  }

  return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
}

async function createGitTag(version: string, message?: string): Promise<void> {
  try {
    const tag = version.startsWith('v') ? version : `v${version}`;
    const tagMessage = message || `Release ${tag}`;

    console.log(`Creating git tag: ${tag}`);
    await execAsync(`git tag -a ${tag} -m "${tagMessage}"`);

    console.log(`Pushing tag to origin...`);
    await execAsync(`git push origin ${tag}`);

    console.log(`✅ Tag ${tag} created and pushed successfully`);
  } catch (error) {
    console.error('Failed to create git tag:', error);
    throw error;
  }
}

async function updatePackageVersion(version: string): Promise<void> {
  try {
    const packagePath = path.join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));

    packageJson.version = version;

    fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
    console.log(`✅ Updated package.json version to ${version}`);
  } catch (error) {
    console.error('Failed to update package.json:', error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  const versionArg = args.find(arg => arg.startsWith('--version='))?.split('=')[1];
  const incrementType = args.find(arg => ['--major', '--minor', '--patch'].includes(arg))?.replace('--', '') as 'major' | 'minor' | 'patch' | undefined;
  const messageArg = args.find(arg => arg.startsWith('--message='))?.split('=')[1];
  const skipPush = args.includes('--skip-push');
  const updatePackage = args.includes('--update-package');

  console.log('📦 Version Tagging Tool\n');

  let newVersion: string;

  if (versionArg) {
    newVersion = versionArg.replace(/^v/, '');
    console.log(`Using specified version: ${newVersion}`);
  } else if (incrementType) {
    const currentVersion = await getCurrentVersion();
    newVersion = incrementVersion(currentVersion, incrementType);
    console.log(`Incrementing ${incrementType} version: ${currentVersion} → ${newVersion}`);
  } else {
    const currentVersion = await getCurrentVersion();
    newVersion = currentVersion;
    console.log(`Using current package.json version: ${newVersion}`);
  }

  // Validate version format
  parseVersion(newVersion);

  const latestTag = await getLatestGitTag();
  if (latestTag) {
    console.log(`Latest git tag: ${latestTag}`);
  }

  if (updatePackage) {
    await updatePackageVersion(newVersion);

    // Commit the version change
    try {
      await execAsync('git add package.json');
      await execAsync(`git commit -m "chore: bump version to ${newVersion}"`);
      console.log('✅ Committed version change to git');
    } catch (error) {
      console.log('No changes to commit or commit failed');
    }
  }

  if (!skipPush) {
    await createGitTag(newVersion, messageArg);
  } else {
    console.log(`Skipping git tag creation (--skip-push specified)`);
    console.log(`Would have created tag: v${newVersion}`);
  }

  console.log('\n✅ Version tagging completed!');
  console.log(`   Version: ${newVersion}`);
  console.log(`   Tag: v${newVersion}`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Version tagging failed:', error.message);
    process.exit(1);
  });
}

export { parseVersion, incrementVersion, createGitTag, updatePackageVersion };
