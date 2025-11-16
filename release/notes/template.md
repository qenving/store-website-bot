# Release v{{VERSION}}

**Release Date:** {{DATE}}
**Release Type:** {{RELEASE_TYPE}}

## 🎉 What's New

### New Features

- Feature 1: Description
- Feature 2: Description
- Feature 3: Description

### Enhancements

- Enhancement 1: Description
- Enhancement 2: Description

### Bug Fixes

- Fix 1: Description
- Fix 2: Description

## 🔒 Security

### Security Improvements

- Security improvement 1
- Security improvement 2

### Security Fixes

- Security fix 1
- Security fix 2

**Note:** This release includes important security updates. Upgrade is recommended.

## 🚀 Performance

- Performance improvement 1
- Performance improvement 2

## 📦 Dependencies

### Updated Dependencies

- `package-name` from `1.0.0` to `1.1.0`
- `another-package` from `2.0.0` to `2.1.0`

### New Dependencies

- `new-package` `1.0.0`

## 🔄 Breaking Changes

**⚠️ IMPORTANT:** This release contains breaking changes.

- Breaking change 1: Migration path
- Breaking change 2: Migration path

## 🗃️ Database Migrations

This release requires database migrations:

```bash
npm run migrate:prod
```

**Migration Scripts:**
- `001_migration_name` - Description
- `002_migration_name` - Description

## 📝 Migration Guide

### Upgrading from v{{PREV_VERSION}}

1. **Backup your database**
   ```bash
   mysqldump -u user -p discord_store_prod > backup_$(date +%Y%m%d).sql
   ```

2. **Pull the latest changes**
   ```bash
   git pull origin main
   ```

3. **Install dependencies**
   ```bash
   npm ci
   ```

4. **Run database migrations**
   ```bash
   npm run migrate:prod
   ```

5. **Update environment variables**
   - Add new required variables (see below)
   - Update existing variable formats if needed

6. **Restart services**
   ```bash
   # Docker
   docker-compose down && docker-compose up -d

   # Kubernetes
   kubectl rollout restart deployment/api-deployment
   kubectl rollout restart deployment/bot-deployment
   ```

### New Environment Variables

```env
# Add these to your .env file
NEW_VAR_1=value
NEW_VAR_2=value
```

### Deprecated Features

The following features are deprecated and will be removed in v{{NEXT_MAJOR_VERSION}}:

- Deprecated feature 1
- Deprecated feature 2

## 🐛 Known Issues

- Known issue 1: Workaround
- Known issue 2: Workaround

## 📖 Documentation

- [Installation Guide](https://docs.discordstorebot.com/installation)
- [Configuration Guide](https://docs.discordstorebot.com/configuration)
- [API Reference](https://docs.discordstorebot.com/api)
- [Security Best Practices](https://docs.discordstorebot.com/security)

## 🔗 Links

- [GitHub Repository](https://github.com/qenving/store-website-bot)
- [Issue Tracker](https://github.com/qenving/store-website-bot/issues)
- [Changelog](https://github.com/qenving/store-website-bot/blob/main/CHANGELOG.md)
- [Discord Support Server](https://discord.gg/your-invite)

## 📥 Download

### Electron Desktop App

- **Windows:** [discord-store-bot-setup-{{VERSION}}.exe](https://github.com/qenving/store-website-bot/releases/download/v{{VERSION}}/discord-store-bot-setup-{{VERSION}}.exe)
- **macOS:** [discord-store-bot-{{VERSION}}.dmg](https://github.com/qenving/store-website-bot/releases/download/v{{VERSION}}/discord-store-bot-{{VERSION}}.dmg)
- **Linux:** [discord-store-bot-{{VERSION}}.AppImage](https://github.com/qenving/store-website-bot/releases/download/v{{VERSION}}/discord-store-bot-{{VERSION}}.AppImage)

### Docker Images

```bash
# Pull the latest images
docker pull ghcr.io/qenving/store-website-bot/api:{{VERSION}}
docker pull ghcr.io/qenving/store-website-bot/bot:{{VERSION}}
docker pull ghcr.io/qenving/store-website-bot/worker:{{VERSION}}
docker pull ghcr.io/qenving/store-website-bot/store:{{VERSION}}
docker pull ghcr.io/qenving/store-website-bot/gateway:{{VERSION}}
```

### Helm Chart

```bash
# Install or upgrade using Helm
helm repo add discord-store-bot https://charts.discordstorebot.com
helm repo update
helm upgrade --install discord-store-bot discord-store-bot/discord-store-bot --version {{VERSION}}
```

## 🙏 Contributors

Thank you to all the contributors who made this release possible:

- @contributor1
- @contributor2
- @contributor3

**Full Changelog:** https://github.com/qenving/store-website-bot/compare/v{{PREV_VERSION}}...v{{VERSION}}

---

## ⚙️ Technical Details

### Supported Platforms

- Node.js: 18.x, 20.x
- Database: MySQL 8.0+
- Cache: Redis 6.0+
- Kubernetes: 1.24+

### System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 2 GB
- Disk: 10 GB

**Recommended:**
- CPU: 4 cores
- RAM: 4 GB
- Disk: 20 GB

### Checksums

```
SHA256 (discord-store-bot-setup-{{VERSION}}.exe) = {{CHECKSUM_WIN}}
SHA256 (discord-store-bot-{{VERSION}}.dmg) = {{CHECKSUM_MAC}}
SHA256 (discord-store-bot-{{VERSION}}.AppImage) = {{CHECKSUM_LINUX}}
```

---

**For support and questions, please visit our [Discord Server](https://discord.gg/your-invite) or [open an issue](https://github.com/qenving/store-website-bot/issues/new).**
