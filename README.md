# Discord Store Bot - Foundation (Phase 1)

Enterprise-grade Discord Bot + Website Store system with centralized transaction engine.

## Architecture

```
/src
   /bot          - Discord bot with slash commands
   /website      - Express.js store website
   /api          - Internal REST API
   /core
      /db        - Database Abstraction Layer (JSON/MySQL/MongoDB)
      /transactions - Transaction Engine (core system)
      /payments  - Payment gateway integrations (Mock for now)
      /logging   - Winston logging system
      /config    - Configuration management
   /realtime     - Socket.io realtime events
```

## Features (Phase 1)

- ✅ Discord bot with /buy and /orderstatus commands
- ✅ Website store with product catalog and checkout
- ✅ Multi-database support (JSON, MySQL, MongoDB)
- ✅ Centralized TransactionEngine
- ✅ Mock Payment Gateway
- ✅ Internal REST API
- ✅ Realtime events via Socket.io
- ✅ Comprehensive logging
- ✅ Unit tests for core components

## Installation

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`
2. Copy `config.example.json` to `config.json`
3. Configure your Discord bot token and database settings

### Environment Variables

```
DB_DRIVER=json          # json | mysql | mongodb
DISCORD_TOKEN=...       # Your Discord bot token
DISCORD_CLIENT_ID=...   # Your Discord application client ID
```

## Usage

### Development Mode

Run each service separately:

```bash
# Discord Bot
npm run dev:bot

# Website
npm run dev:website

# Internal API
npm run dev:api
```

### Production Mode

```bash
npm run build
npm start
```

## Testing

```bash
npm test
```

## Database Modes

### JSON (Default)
File-based storage with atomic writes. No setup required.

### MySQL
Configure MySQL credentials in `.env`:
```
DB_DRIVER=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=
MYSQL_DATABASE=discord_store
```

### MongoDB
Configure MongoDB URI in `.env`:
```
DB_DRIVER=mongodb
MONGODB_URI=mongodb://localhost:27017/discord_store
```

## API Endpoints

### Internal API (Port 3001)
- `GET /internal/status` - System status
- `GET /internal/transactions` - List all transactions
- `GET /internal/transactions/:transactionId` - Get transaction by ID
- `GET /internal/transactions/order/:orderId` - Get transaction by order ID
- `POST /internal/mock-webhook` - Mock payment webhook

### Website (Port 3000)
- `GET /store/products` - Product catalog
- `GET /store/order?productId=...` - Order page
- `POST /store/order` - Create order
- `GET /store/status?orderId=...` - Order status

## Discord Commands

- `/buy <product>` - Purchase a product
- `/orderstatus <orderid>` - Check order status

## Transaction Flow

```
1. User initiates purchase (Discord/Web)
   ↓
2. TransactionEngine.createOrder()
   ↓
3. Save transaction to database
   ↓
4. MockGateway.createPayment()
   ↓
5. Emit socket event "transaction_created"
   ↓
6. Auto-confirm after delay (mock)
   ↓
7. TransactionEngine.updateState() via webhook
   ↓
8. Emit socket event "transaction_updated"
```

## Project Structure

All core logic flows through:
1. **DAL** - Database operations
2. **TransactionEngine** - Business logic
3. **RealtimeServer** - Event broadcasting

Bot, Website, and API are thin layers that call TransactionEngine.

## License

MIT

---

## FASE 2: Admin Desktop Dashboard

Enterprise Electron-based desktop dashboard for managing and monitoring the Discord Store Bot.

### Features

- **Real-time Monitoring**
  - Bot status (online/offline)
  - Bot uptime tracking
  - Ping monitoring
  - Pending transactions count
  - Connected guilds count

- **Live Logs**
  - Real-time log streaming via Socket.io
  - Transaction event monitoring
  - Filterable log levels (info, warn, error, debug)

- **Bot Control**
  - Stop bot
  - Restart bot
  - Toggle maintenance mode
  - Local-only access (security enforced)

### Architecture

```
Dashboard (Electron)
  ├── Main Process
  │   ├── IPC Handlers
  │   ├── Socket.io Client
  │   └── API Bridge
  │
  └── Renderer Process
      ├── Home Tab (Status & Stats)
      ├── Logs Tab (Real-time Logs)
      └── Controls Tab (Bot Management)

Communication:
- Socket.io → Real-time events from bot/API
- IPC → Secure communication main ↔ renderer
- HTTP → Admin API calls (localhost only)
```

### Starting the Dashboard

```bash
npm start
```

This will:
1. Build TypeScript files
2. Start Internal API server
3. Start Socket.io realtime server
4. Start Discord bot
5. Launch Electron dashboard

### Dashboard Structure

```
/src/dashboard
   /main
      electronMain.ts    - Electron main process
      preload.ts         - Preload script (security bridge)
      ipcHandlers.ts     - IPC request handlers
   /renderer
      index.html         - Dashboard UI
      index.ts           - Renderer entry point
      /ui
         home.ts         - Home tab logic
         logs.ts         - Logs tab logic
         controls.ts     - Controls tab logic
   /shared
      types.ts           - Shared TypeScript types
      ipcChannels.ts     - IPC channel definitions
```

### Security

- Dashboard only accessible from localhost
- No remote access allowed
- Context isolation enabled
- Node integration disabled
- Sandbox enabled
- All API calls validated for localhost origin

### Admin API Endpoints

- `GET /internal/admin/status` - Get bot status
- `GET /internal/admin/pending-transactions` - Get pending count
- `GET /internal/admin/maintenance` - Get maintenance mode status
- `POST /internal/admin/maintenance/toggle` - Toggle maintenance mode
- `POST /internal/admin/shutdown` - Shutdown bot

All endpoints restricted to localhost only.

### Real-time Events

Dashboard receives:
- `bot_status` - Bot status updates (every 5s)
- `log_message` - Log entries
- `transaction_created` - New transaction events
- `transaction_updated` - Transaction updates
- `transaction_completed` - Completed transactions
- `transaction_failed` - Failed transactions
- `maintenance_mode` - Maintenance mode changes

