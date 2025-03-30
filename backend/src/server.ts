import express from "express";
import { config } from "dotenv";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = new McpServer({
  name: "mcp-sse-server",
  version: "1.0.0",
});

// Add an addition tool
server.tool("add", { a: z.number(), b: z.number() }, async ({ a, b }) => ({
  content: [{ type: "text", text: String(a + b) }],
}));

server.tool(
  "search",
  { query: z.string(), count: z.number().optional() },
  async ({ query, count = 5 }: { query: string; count?: number }) => {
    console.log("query==========>", query, count, process.env.BRAVE_API_KEY);
    if (!process.env.BRAVE_API_KEY) {
      throw new Error("BRAVE_API_KEY environment variable is not set");
    }

    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(
        query
      )}&count=${count}`,
      {
        headers: {
          "X-Subscription-Token": process.env.BRAVE_API_KEY,
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Brave search failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(data.web?.results || [], null, 2),
        },
      ],
    };
  }
);

// Individual static resources
server.resource("config", "config://app", async (uri) => ({
  contents: [
    {
      uri: uri.href,
      text: "App configuration here",
    },
  ],
}));

server.resource("documentation", "documentation://i75corridor", async (uri) => {
  const logPath = path.join(
    __dirname,
    "texts",
    "documentation",
    "i75corridor",
    "llms-full.txt"
  );
  const content = await fs.readFile(logPath, "utf-8");
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: "text/plain",
        text: content,
      },
    ],
  };
});

// Add a dynamic greeting resource
server.resource(
  "greeting",
  new ResourceTemplate("greeting://{name}", { list: undefined }),
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`,
      },
    ],
  })
);

// Log file resource
server.resource(
  "logs",
  new ResourceTemplate("log://{filename}", { list: undefined }),
  async (uri, { filename }) => {
    try {
      const logPath = path.join(__dirname, "logs", String(filename));
      const content = await fs.readFile(logPath, "utf-8");
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: content,
          },
        ],
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to read log file: ${error.message}`);
      }
      throw new Error("Failed to read log file: Unknown error");
    }
  }
);

// Image/PDF resource
server.resource(
  "documents",
  new ResourceTemplate("doc://{type}/{filename}", { list: undefined }),
  async (uri, { type, filename }) => {
    try {
      const docPath = path.join(
        __dirname,
        "documents",
        String(type),
        String(filename)
      );
      const content = await fs.readFile(docPath);
      const mimeType = type === "images" ? "image/png" : "application/pdf";

      return {
        contents: [
          {
            uri: uri.href,
            mimeType,
            blob: content.toString("base64"),
          },
        ],
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to read document: ${error.message}`);
      }
      throw new Error("Failed to read document: Unknown error");
    }
  }
);

// Text file resource
server.resource(
  "texts",
  new ResourceTemplate("text://{category}/{filename}", { list: undefined }),
  async (uri, { category, filename }) => {
    try {
      const textPath = path.join(
        __dirname,
        "texts",
        String(category),
        String(filename)
      );
      const content = await fs.readFile(textPath, "utf-8");

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "text/plain",
            text: content,
          },
        ],
      };
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new Error(`Failed to read text file: ${error.message}`);
      }
      throw new Error("Failed to read text file: Unknown error");
    }
  }
);

// Database resource (example with a simple in-memory store)
const dbStore = new Map();

server.resource(
  "database",
  new ResourceTemplate("db://{collection}/{id}", { list: undefined }),
  async (uri, { collection, id }) => {
    const key = `${collection}:${id}`;
    const data = dbStore.get(key);

    if (!data) {
      throw new Error(`Resource not found: ${key}`);
    }

    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data),
        },
      ],
    };
  }
);

// Helper function to populate the database store
function populateDbStore() {
  dbStore.set("users:1", {
    id: 1,
    name: "John Doe",
    email: "john@example.com",
  });
  dbStore.set("users:2", {
    id: 2,
    name: "Jane Smith",
    email: "jane@example.com",
  });
  dbStore.set("products:1", { id: 1, name: "Product 1", price: 99.99 });
  dbStore.set("products:2", { id: 2, name: "Product 2", price: 149.99 });
}

// Populate the database store when server starts
populateDbStore();

const app = express();

// Configure CORS middleware to allow all origins
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS"],
    credentials: false,
  })
);

// Add a simple root route handler
app.get("/", (req, res) => {
  res.json({
    name: "MCP SSE Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      "/": "Server information (this response)",
      "/sse": "Server-Sent Events endpoint for MCP connection",
      "/messages": "POST endpoint for MCP messages",
    },
    tools: [
      { name: "add", description: "Add two numbers together" },
      { name: "search", description: "Search the web using Brave Search API" },
    ],
  });
});

let transport: SSEServerTransport;

app.get("/sse", async (req, res) => {
  transport = new SSEServerTransport("/messages", res);
  await server.connect(transport);
});

app.post("/messages", async (req, res) => {
  // Note: to support multiple simultaneous connections, these messages will
  // need to be routed to a specific matching transport. (This logic isn't
  // implemented here, for simplicity.)
  await transport.handlePostMessage(req, res);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`MCP SSE Server running on port ${PORT}`);
});
