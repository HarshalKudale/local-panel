# Local Panel

> **Localhost domain proxy manager and API development toolkit**

Local Panel is a powerful desktop application that simplifies local API development by providing intelligent request routing, mock responses, traffic capture, and comprehensive protocol support — all with git-backed workspace management.

[![Tests](https://github.com/HarshalKudale/local-panel/actions/workflows/test.yml/badge.svg)](https://github.com/HarshalKudale/local-panel/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## ✨ Key Features

- 🌐 **Localhost Domain Mapping** — Map `.localhost` domains to any port using RFC 6761 (no `/etc/hosts` edits!)
- 🔄 **HTTP/HTTPS Proxy** — Intercept and route traffic with SSL/TLS certificate generation
- 🎭 **Smart Mocking** — Pattern-matched mock responses with variables and randomizers
- 🔍 **Traffic Capture** — Record, inspect, and replay HTTP/HTTPS requests
- 🌊 **WebSocket Support** — Test and monitor WebSocket connections
- 📡 **Webhooks** — Create instant webhook endpoints for testing
- 🚀 **Multi-Protocol** — REST, GraphQL, SOAP, and gRPC support
- 📁 **Git-Backed Workspaces** — Version control for all your API configurations
- 🔐 **Environment Variables** — Secure variable substitution across all protocols
- ⚙️ **Advanced Scripting** — Pre/post request scripts with sandboxed execution

---

## 📦 Repository Structure

This monorepo contains three projects:

```
LocalPanel/
├── local-panel/              # Main Electron desktop application
├── local-panel-extension/    # Chrome/Edge browser extension
└── docs/                     # Complete documentation
```

### **local-panel** (Electron App)

The core desktop application built with Electron, React, and TypeScript. Runs a TCP proxy server and provides a comprehensive UI for managing API development workflows.

**Tech Stack:**
- Electron 42.1
- React 18.3
- TypeScript 5.4
- Vite 8.0
- Vitest 4.1 (unit tests)
- Playwright (E2E tests)

### **local-panel-extension** (Browser Extension)

Chrome/Edge extension that integrates Local Panel into browser DevTools for seamless local development.

**Features:**
- DevTools panel integration
- One-click import from Network tab
- Automatic workspace sync
- Capture traffic directly from browser

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Git** (for workspace sync)
- **mkcert** (optional, for HTTPS certificate generation)

### Installation

```bash
# Clone the repository
git clone https://github.com/HarshalKudale/local-panel.git
cd local-panel

# Install and run the main application
cd local-panel
npm install
npm run dev
```

### First Steps

1. **Map a service** — Create a mapping like `api.localhost` → `localhost:3000`
2. **Configure browser** — Set proxy to `127.0.0.1:8080` (or use direct `.localhost` access)
3. **Create a mock** — Add mock responses for `GET /users` → `{ "users": [...] }`
4. **Capture traffic** — Enable capture to record and inspect requests
5. **Test protocols** — Try GraphQL queries, SOAP requests, or gRPC calls

📚 **See [Getting Started Guide](docs/getting-started.md) for detailed walkthrough**

---

## 🧪 Testing

### Unit Tests (Vitest)

```bash
cd local-panel
npm test                    # Run all unit tests
npm run test:watch          # Watch mode
npm run test:coverage       # Generate coverage report
```

**Coverage:** 700 tests across 27 files (30% statement coverage)

### E2E Tests (Playwright)

```bash
cd local-panel
npm run test:e2e            # Headless mode
npm run test:e2e:headed     # Watch UI interactions
```

**Coverage:** 45 tests covering all major workflows:
- Application launch and navigation
- Mappings, mocks, proxy rules
- REST/GraphQL/SOAP/gRPC panels
- Capture, WebSocket, Webhooks
- Settings and workspace management

---

## 📖 Documentation

Comprehensive documentation is available in the [`docs/`](docs/) folder:

- **[Features Overview](docs/features.md)** — Complete feature list with capabilities
- **[Getting Started](docs/getting-started.md)** — Installation and setup guide
- **[User Guide](docs/user-guide.md)** — Detailed usage instructions
- **[Network Architecture](docs/network-architecture.md)** — How routing and proxying work
- **[Browser Extension](docs/browser-extension.md)** — Extension setup and usage
- **[Protocol Guides](docs/protocols/)** — GraphQL, SOAP, and gRPC specifics
- **[Roadmap](docs/roadmap/plan.md)** — Future features and improvements

---

## 🏗️ Building

### Desktop App

```bash
cd local-panel
npm run build              # Build main + renderer
npm run package            # Create distributable (.exe, .dmg, .deb)
```

### Browser Extension

The browser extension is plain JavaScript and can be loaded unpacked for development:

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `local-panel-extension/` folder

**To build for distribution:**

```bash
cd local-panel-extension
npm run build              # Creates dist/ and .zip file
```

Or from the root:

```bash
npm run build:extension    # Build extension
npm run package:extension  # Same as build (creates .zip)
```

The `local-panel-extension.zip` file is ready for Chrome Web Store submission!

---

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup

```bash
# Install dependencies for all packages
cd local-panel && npm install
cd ../local-panel-extension  # No build step required

# Run tests
cd local-panel
npm test                   # Unit tests
npm run test:e2e          # E2E tests
```

### Project Conventions

- **TypeScript** for all code
- **Vitest** for unit tests (node environment)
- **Playwright** for E2E tests (Electron automation)
- **ESLint + Prettier** for code formatting
- **Conventional Commits** for commit messages

---

## 📋 Architecture

**Frontend (Renderer Process):**
- React 18 with TypeScript
- TailwindCSS for styling
- CodeMirror for editors
- Zustand for state management

**Backend (Main Process):**
- Raw TCP proxy server with HTTP/HTTPS handling
- Certificate generation (mkcert integration)
- IPC communication with renderer
- File-based entity storage with git sync

**Testing:**
- Vitest with v8 coverage for unit tests
- Playwright with Electron launcher for E2E tests
- Isolated userData directory per test
- GitHub Actions CI/CD pipeline

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

---

## 👤 Author

**Harshal Kudale**
- Website: [harshalkudale.com](https://harshalkudale.com)
- GitHub: [@HarshalKudale](https://github.com/HarshalKudale)

---

## 🙏 Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Certificate generation via [mkcert](https://github.com/FiloSottile/mkcert)
- Testing powered by [Vitest](https://vitest.dev/) and [Playwright](https://playwright.dev/)
- UI components styled with [TailwindCSS](https://tailwindcss.com/)

---

## 📊 Project Stats

- **700 unit tests** across core functionality
- **45 E2E tests** covering complete workflows
- **30% test coverage** (actively improving)
- **Multi-protocol support** (REST, GraphQL, SOAP, gRPC)
- **Git-backed** workspace management
- **Cross-platform** (Windows, macOS, Linux)

---

**Made with ❤️ for developers who need powerful local API tools**
