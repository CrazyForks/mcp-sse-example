import express from "express";
import { config } from "dotenv";
import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Request, Response } from "express";
import crypto from "crypto";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";


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
    "..",
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
      const logPath = path.join(__dirname, "..", "logs", String(filename));
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
        "..",
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
        "..",
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

// ===== MCP PROMPTS =====

// Web search summary prompt
server.prompt(
  "search-summarize",
  "Search the web and summarize results",
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Search for information and summarize the results.",
        },
      },
    ],
  })
);

// Product comparison prompt
server.prompt(
  "compare-products",
  "Compare two products from the database",
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please compare these two products and provide pros and cons of each. Use product IDs as parameters.",
        },
      },
    ],
  })
);

// User profile analysis prompt
server.prompt("user-profile-summary", "Analyze user profile data", () => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "Please analyze a user profile and provide a summary. Use the user ID as a parameter.",
      },
    },
  ],
}));

// Document analysis prompt
server.prompt(
  "analyze-document",
  "Analyze document content for insights",
  () => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Please analyze a document and provide key insights. Use category and filename as parameters.",
        },
      },
    ],
  })
);

// Simple calculator prompt
server.prompt("calculate", "Perform calculation using the add tool", () => ({
  messages: [
    {
      role: "user",
      content: {
        type: "text",
        text: "Calculate the sum of two numbers using the add tool. Provide the numbers as parameters.",
      },
    },
  ],
}));

// Code analysis prompt
server.prompt(
  "analyze-code-file",
  "Analyze code file for bugs and improvements",
  { fileUri: z.string() },
  ({ fileUri }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Analyze this code file for potential bugs and improvements: ${fileUri}`,
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `text://code/${fileUri}`,
            text: `text://code/${fileUri}`,
            mimeType: "text/plain",
          },
        },
      },
    ],
  })
);

// Log analysis prompt
server.prompt(
  "analyze-logs",
  "Analyze system logs for errors within a time period",
  { hours: z.string() },
  ({ hours }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Analyze these system logs from the past ${hours} hours and identify any critical issues:`,
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `log://system-${hours}h.log`,
            text: `log://system-${hours}h.log`,
            mimeType: "text/plain",
          },
        },
      },
    ],
  })
);

// Multi-document comparison prompt
server.prompt(
  "compare-documents",
  "Compare two documents and highlight differences",
  { doc1: z.string(), doc2: z.string() },
  ({ doc1, doc2 }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Compare these two documents and highlight key differences:",
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `text://documents/${doc1}`,
            text: `text://documents/${doc1}`,
            mimeType: "text/plain",
          },
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `text://documents/${doc2}`,
            text: `text://documents/${doc2}`,
            mimeType: "text/plain",
          },
        },
      },
    ],
  })
);

// User data analysis prompt
server.prompt(
  "analyze-user",
  "Analyze user activity and profile",
  { userId: z.string() },
  ({ userId }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: "Analyze this user's profile and activity data:",
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `db://users/${userId}`,
            text: `db://users/${userId}`,
            mimeType: "application/json",
          },
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `log://user-activity-${userId}.log`,
            text: `log://user-activity-${userId}.log`,
            mimeType: "text/plain",
          },
        },
      },
    ],
  })
);

// Documentation search prompt
server.prompt(
  "search-documentation",
  "Search documentation for specific topic",
  { topic: z.string(), category: z.string() },
  ({ topic, category }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Find information about "${topic}" in our documentation:`,
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `documentation://${category}`,
            text: `documentation://${category}`,
            mimeType: "text/plain",
          },
        },
      },
    ],
  })
);

// Product recommendation prompt
server.prompt(
  "recommend-products",
  "Recommend products based on user preferences",
  { preferences: z.string(), userId: z.string() },
  ({ preferences, userId }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `Recommend products based on these preferences: ${preferences}`,
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `db://users/${userId}`,
            text: `db://users/${userId}`,
            mimeType: "application/json",
          },
        },
      },
      {
        role: "user",
        content: {
          type: "resource",
          resource: {
            uri: `db://products/catalog`,
            text: `db://products/catalog`,
            mimeType: "application/json",
          },
        },
      },
    ],
  })
);

const app = express();

// Configure CORS middleware to allow all origins
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:5174", "http://127.0.0.1:5174"], // Vite's dev server ports
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Mcp-Session-Id", "Accept", "Last-Event-ID"],
    exposedHeaders: ["Mcp-Session-Id"],
    credentials: true
  })
);

// Add JSON parsing middleware for /mcp route only
app.use('/mcp', express.json());

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
      "/mcp": "Streamable HTTP endpoint for MCP connection",
    },
    tools: [
      { name: "add", description: "Add two numbers together" },
      { name: "search", description: "Search the web using Brave Search API" },
    ],
  });
});

// Store transports by session ID
const transports: Record<string, StreamableHTTPServerTransport> = {};

// SSE transport implementation
let sseTransport: SSEServerTransport;

app.get("/sse", async (req, res) => {
  sseTransport = new SSEServerTransport("/messages", res);
  await server.connect(sseTransport);
});

app.post("/messages", async (req, res) => {
  // Note: to support multiple simultaneous connections, these messages will
  // need to be routed to a specific matching transport. (This logic isn't
  // implemented here, for simplicity.)
  await sseTransport.handlePostMessage(req, res);
});

// Streamable HTTP transport handler
const streamableHttpHandler = async (
  server: McpServer,
  req: Request,
  res: Response
) => {
  if (req.method === "POST") {
    // Handle initial connection or regular POST request
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    
    try {
      // Check if this is an initialization request
      const isInit = isInitializeRequest(req.body);
      
      // Create a new transport for this session if it doesn't exist or if this is an init request
      if (!sessionId || !transports[sessionId] || isInit) {
        console.log(`Creating new transport for ${isInit ? 'initialization request' : 'request without valid session'}`);
        
        const newSessionId = sessionId || crypto.randomUUID();
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => newSessionId,
          onsessioninitialized: (sid) => {
            // Store the transport by session ID
            console.log(`Transport initialized with session ID: ${sid}`);
            transports[sid] = transport;
          }
        });
        
        // Connect the transport to the server
        await server.connect(transport);
        console.log(`Connected transport to server`);
        
        // Set session ID header in response
        res.setHeader("Mcp-Session-Id", newSessionId);
        
        // Use the new transport directly for this request - pass the request body
        console.log(`Handling ${isInit ? 'initialization' : 'regular'} request with new transport`);
        await transport.handleRequest(req, res, req.body);
        return;
      }
      
      // If we have a valid sessionId and transport, use it - pass the request body
      if (sessionId && transports[sessionId]) {
        console.log(`Using existing transport for session ${sessionId}`);
        await transports[sessionId].handleRequest(req, res, req.body);
        return;
      }
      
      // If we get here, something went wrong
      console.error(`No valid transport found for session ${sessionId}`);
      res.status(400).json({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message: "Invalid session or transport not available",
        },
        id: null,
      });
    } catch (error) {
      console.error("Error processing request:", error);
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
          data: String(error),
        },
        id: null,
      });
    }
  } 
  else if (req.method === "GET") {
    // Handle SSE stream request
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    
    // Check for Last-Event-ID header for resumability
    const lastEventId = req.headers["last-event-id"] as string | undefined;
    if (lastEventId) {
      console.log(`Client reconnecting with Last-Event-ID: ${lastEventId}`);
    } else {
      console.log(`Establishing new SSE stream for session ${sessionId}`);
    }
    
    await transports[sessionId].handleRequest(req, res);
  }
  else if (req.method === "DELETE") {
    // Handle session termination request
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports[sessionId]) {
      res.status(400).send("Invalid or missing session ID");
      return;
    }
    
    console.log(`Received session termination request for session ${sessionId}`);
    await transports[sessionId].handleRequest(req, res);
    
    // Clean up after termination
    delete transports[sessionId];
  }
  else {
    // Handle other HTTP methods
    res.status(405).send("Method not allowed");
  }
};

app.all('/mcp', async (req, res) => {
  await streamableHttpHandler(server, req, res);
});

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`MCP Server running on port ${PORT}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  // Close all active transports to properly clean up resources
  for (const sessionId in transports) {
    try {
      console.log(`Closing transport for session ${sessionId}`);
      await transports[sessionId].close();
      delete transports[sessionId];
    } catch (error) {
      console.error(`Error closing transport for session ${sessionId}:`, error);
    }
  }
  console.log('Server shutdown complete');
  process.exit(0);
});
