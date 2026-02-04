# MCP Server Setup for Kilo Code

This guide explains how to configure MCP (Model Context Protocol) servers for both the Kilo Code VS Code extension and the CLI.

## Configuration File Locations

### VS Code Extension

```
~/Library/Application Support/Code/User/globalStorage/kilocode.kilo-code/settings/mcp_settings.json
```

### CLI

```
~/.kilocode/cli/global/settings/mcp_settings.json
```

Both files use the same JSON format. You need to configure both if you want MCP servers available in both the extension and CLI.

## Configuration Format

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "/path/to/executable",
      "args": ["arg1", "arg2"],
      "env": {
        "ENV_VAR": "value"
      }
    }
  }
}
```

## Available MCP Servers

### Sentry MCP

Provides tools for searching issues, getting issue details, listing projects/organizations, and more from Sentry.

#### Prerequisites

1. **Sentry Auth Token**: Create a read-only token at https://sentry.io/settings/account/api/auth-tokens/ with scopes:
   - `project:read`
   - `org:read`
   - `issue:read`

   **Note**: Write access (`issue:write`) is not required for triaging purposes.

2. **OpenAI API Key** (optional, for AI-powered search): Create one at https://platform.openai.com/settings/organization/api-keys

#### Installation

Install the Sentry MCP server globally:

```bash
npm install -g @sentry/mcp-server
```

#### Configuration

```json
{
  "mcpServers": {
    "sentry": {
      "type": "stdio",
      "command": "/path/to/node",
      "args": [
        "/path/to/node_modules/@sentry/mcp-server/dist/index.js",
        "--access-token=YOUR_SENTRY_AUTH_TOKEN"
      ],
      "env": {
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY"
      }
    }
  }
}
```

**Note**: Replace `/path/to/node` with your actual node path (e.g., from `which node`). If using nvm, use the full path like `/Users/username/.nvm/versions/node/v20.x.x/bin/node`.

#### Available Tools

Without OpenAI API key:

- All standard Sentry tools (list issues, get issue details, list projects, etc.)

With OpenAI API key:

- `search_events` - Natural language event search
- `search_issues` - Natural language issue search

---

### Axiom MCP

Provides tools for querying and analyzing observability data from Axiom.

#### Configuration

Axiom uses OAuth authentication via the `mcp-remote` library:

```json
{
  "mcpServers": {
    "axiom": {
      "type": "stdio",
      "command": "/path/to/npx",
      "args": ["-y", "mcp-remote", "https://mcp.axiom.co/mcp"],
      "env": {}
    }
  }
}
```

**Note**: Replace `/path/to/npx` with your actual npx path (e.g., from `which npx`).

#### Authentication

When you first use Axiom MCP, it will open a browser window for OAuth authentication. You can revoke access later from your Axiom profile page.

#### Available Tools

- List datasets
- Get data schema
- Query event data
- And more observability tools

---

## Complete Example Configuration

```json
{
  "mcpServers": {
    "sentry": {
      "type": "stdio",
      "command": "/Users/username/.nvm/versions/node/v20.19.2/bin/node",
      "args": [
        "/Users/username/.nvm/versions/node/v20.19.2/lib/node_modules/@sentry/mcp-server/dist/index.js",
        "--access-token=YOUR_SENTRY_AUTH_TOKEN"
      ],
      "env": {
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY"
      }
    },
    "axiom": {
      "type": "stdio",
      "command": "/Users/username/.nvm/versions/node/v20.19.2/bin/npx",
      "args": ["-y", "mcp-remote", "https://mcp.axiom.co/mcp"],
      "env": {}
    }
  }
}
```

## Troubleshooting

### MCP server not appearing

1. Ensure the configuration file is valid JSON
2. Restart VS Code or the CLI after making changes
3. Check that all paths are absolute and correct for your system

### "Connection closed" error

1. Verify the command path is correct (use `which node` or `which npx`)
2. If using nvm, use the full path to the node binary
3. Test the server manually in terminal to check for errors

### Sentry AI search not working

Ensure you have set the `OPENAI_API_KEY` environment variable in the Sentry MCP configuration. Create an API key at https://platform.openai.com/settings/organization/api-keys

### Axiom authentication issues

1. Clear the `.mcp-auth` folder at `~/.mcp-auth`
2. Restart the CLI/extension
3. Re-authenticate when prompted
