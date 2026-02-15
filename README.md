# OpenRouteX 🚀

**OpenRouteX** (formerly Smart Router) is a high-performance, intelligent LLM gateway that routes requests to the best provider based on cost, latency, and quality. It features a modern dashboard, multi-account support, and enterprise-grade security.

![OpenRouteX Dashboard](https://via.placeholder.com/800x400?text=OpenRouteX+Dashboard)

## ✨ Features

- **🧠 Smart Routing**: Automatically routes prompts to the most cost-effective or capable model based on complexity.
- **🔄 Multi-Account Rotation**: seamless load balancing across multiple provider accounts (Antigravity, OpenAI, etc.).
- **📊 Real-time Dashboard**: Monitor requests, tokens, costs, and latency in real-time.
- **🔐 Enterprise Security**: Dashboard authentication and Client API Key management.
- **🐳 Docker Ready**: One-click deployment with Docker Compose.
- **🔌 OpenAI Compatible**: Drop-in replacement for any OpenAI-compatible client.

## 🚀 Installation

### Option 1: Docker (Recommended)

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/bayuwicaksn/openroutex.git
    cd openroutex
    ```

2.  **Run with Docker Compose**:
    ```bash
    docker-compose up -d
    ```

3.  **Access the Dashboard**:
    Open [http://localhost:3402/dashboard](http://localhost:3402/dashboard)
    *   **Default Password**: `admin`

### Option 2: Manual Installation

1.  **Install Dependencies**:
    ```bash
    npm install
    cd client && npm install && cd ..
    ```

2.  **Build Frontend**:
    ```bash
    npm run build --prefix client
    ```

3.  **Start Server**:
    ```bash
    npm run start
    ```

## ⚙️ Configuration

### Environment Variables

Create a `.env` file (optional, defaults are built-in):

```env
# Server Port
SMART_ROUTER_PORT=3402

# Dashboard Security
SMART_ROUTER_ADMIN_PASSWORD=admin
SMART_ROUTER_JWT_SECRET=your-secret-key
```

### Adding Accounts

1.  Go to **Dashboard** -> **Add Account**.
2.  Select Provider (e.g., OpenAI, Antigravity).
3.  Enter your API Key or OAuth credentials.
4.  (Optional) Add a label like "Personal" or "Business".

## 🔑 Client API Keys

To use OpenRouteX in your apps (Cursor, Cline, etc.):

1.  Go to **Dashboard** -> **Manage** -> **API Keys**.
2.  Generate a new key (e.g., `sk-sr-xxxx...`).
3.  Configure your client:
    *   **Base URL**: `http://localhost:3402/v1`
    *   **API Key**: `sk-sr-xxxx...`
    *   **Model**: `openroutex/auto` (or any specific model like `gpt-4o`)

## 🛠️ Tech Stack

- **Backend**: Node.js, TypeScript, SQLite, Better-SQLite3
- **Frontend**: React, Vite, TailwindCSS, Shadcn/UI, Recharts
- **DevOps**: Docker, GitHub Actions (GHCR)

## License

MIT
