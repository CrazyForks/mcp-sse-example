import React, { useState, useEffect, useRef } from "react";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  ListToolsRequest,
  ListToolsResultSchema,
  CallToolRequest,
  CallToolResultSchema,
  ListPromptsRequest,
  ListPromptsResultSchema,
  GetPromptRequest,
  GetPromptResultSchema,
  ListResourcesRequest,
  ListResourcesResultSchema,
  LoggingMessageNotificationSchema,
  ResourceListChangedNotificationSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { v4 as uuidv4 } from 'uuid';
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  Check, 
  Terminal, 
  Zap, 
  Plug, 
  PlugZap,
  ShieldAlert, 
  List, 
  Search, 
  BrainCircuit,
  WifiOff
} from "lucide-react";

// Update port to match your running server
const MCP_SERVER_BASE_URL = "http://localhost:3003";

// Message types with specific styling
type MessageType = 'error' | 'warning' | 'success' | 'info' | 'command' | 'response';

interface OutputMessage {
  text: string;
  type: MessageType;
  timestamp: Date;
}

export function McpInteractiveClient() {
  const [client, setClient] = useState<Client | null>(null);
  const [transport, setTransport] = useState<StreamableHTTPClientTransport | null>(null);
  const [serverUrl, setServerUrl] = useState<string>(`${MCP_SERVER_BASE_URL}/mcp`);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [notificationsToolLastEventId, setNotificationsToolLastEventId] = useState<string | undefined>(undefined);
  const [connectionStatus, setConnectionStatus] = useState<string>("Not Connected");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const [command, setCommand] = useState<string>("");
  const [output, setOutput] = useState<OutputMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [availableTools, setAvailableTools] = useState<any[]>([]);
  const [availablePrompts, setAvailablePrompts] = useState<any[]>([]);
  const [availableResources, setAvailableResources] = useState<any[]>([]);
  const [toolName, setToolName] = useState<string>("");
  const [toolArgs, setToolArgs] = useState<string>("{}");
  const [promptName, setPromptName] = useState<string>("");
  const [promptArgs, setPromptArgs] = useState<string>("{}");
  const originalFetchRef = useRef<typeof window.fetch>(window.fetch);
  
  const outputEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of output whenever it changes
  useEffect(() => {
    if (outputEndRef.current) {
      outputEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [output]);

  // Determine message type based on content
  const getMessageType = (text: string): MessageType => {
    const lowerText = text.toLowerCase();
    
    if (lowerText.includes("error:") || lowerText.includes("failed") || lowerText.includes("conflict")) {
      return 'error';
    } else if (lowerText.includes("warning") || lowerText.includes("caution")) {
      return 'warning';
    } else if (lowerText.includes("success") || lowerText.includes("connected") || lowerText.includes("sent successfully")) {
      return 'success';
    } else if (lowerText.startsWith(">")) {
      return 'command';
    } else if (lowerText.includes("available") || lowerText.includes("list") || lowerText.includes("tool") || lowerText.includes("prompt")) {
      return 'response';
    } else {
      return 'info';
    }
  };

  const addOutput = (text: string) => {
    const messageType = getMessageType(text);
    const newMessage: OutputMessage = {
      text,
      type: messageType,
      timestamp: new Date()
    };
    setOutput((prev) => [...prev, newMessage]);
  };

  const clearOutput = () => {
    setOutput([]);
  };

  // Gets the appropriate icon for a message type
  const getMessageIcon = (type: MessageType) => {
    switch (type) {
      case 'error':
        return <AlertCircle size={16} className="mr-2 flex-shrink-0" />;
      case 'warning':
        return <AlertTriangle size={16} className="mr-2 flex-shrink-0" />;
      case 'success':
        return <Check size={16} className="mr-2 flex-shrink-0" />;
      case 'command':
        return <Terminal size={16} className="mr-2 flex-shrink-0" />;
      case 'response':
        return <List size={16} className="mr-2 flex-shrink-0" />;
      case 'info':
      default:
        return <Info size={16} className="mr-2 flex-shrink-0" />;
    }
  };

  // Get CSS classes for different message types
  const getMessageClasses = (type: MessageType) => {
    const baseClasses = "flex items-start py-1 opacity-90 hover:opacity-100 transition-all duration-200 rounded px-1 hover:bg-gray-800/40";
    
    switch (type) {
      case 'error':
        return `${baseClasses} text-rose-300 hover:text-rose-200`;
      case 'warning':
        return `${baseClasses} text-amber-300 hover:text-amber-200`;
      case 'success':
        return `${baseClasses} text-emerald-300 hover:text-emerald-200`;
      case 'command':
        return `${baseClasses} text-purple-300 hover:text-purple-200 font-bold`;
      case 'response':
        return `${baseClasses} text-blue-300 hover:text-blue-200`;
      case 'info':
      default:
        return `${baseClasses} text-teal-300 hover:text-teal-200`;
    }
  };

  const handleConnect = async (url?: string) => {
    if (client) {
      addOutput("Already connected. Disconnect first.");
      return;
    }

    if (url) {
      setServerUrl(url);
    }

    setIsLoading(true);
    addOutput(`Connecting to ${serverUrl}...`);

    try {
      // Generate a new session ID if we don't have one
      const currentSessionId = sessionId || uuidv4();
      setSessionId(currentSessionId);
      
      // Create a new client
      const newClient = new Client({
        name: "mcp-interactive-client",
        version: "1.0.0",
      });

      newClient.onerror = (error) => {
        console.error("Client error:", error);
        addOutput(`Error: ${error}`);
      };

      // Save original fetch
      originalFetchRef.current = window.fetch;

      // Override fetch method to ensure the header is set for ALL requests
      window.fetch = function(input, init) {
        // Create a new init object to avoid modifying the original
        const newInit = { ...init };
        
        // Initialize headers if not present
        if (!newInit.headers) {
          newInit.headers = new Headers();
        } else if (!(newInit.headers instanceof Headers)) {
          // Convert to Headers object if it's not already
          const headers = new Headers();
          Object.entries(newInit.headers).forEach(([key, value]) => {
            headers.append(key, String(value));
          });
          newInit.headers = headers;
        }
        
        // Add the session ID header to ALL requests (not just /mcp)
        // This ensures it's added regardless of how the transport makes requests
        (newInit.headers as Headers).set('Mcp-Session-Id', currentSessionId);
        
        // Set CORS mode explicitly
        newInit.mode = 'cors';
        
        // Don't send credentials by default to avoid preflight issues
        if (newInit.credentials === undefined) {
          newInit.credentials = 'same-origin';
        }
        
        console.log('Fetch intercepted:', 
          typeof input === 'string' ? input : input.toString(),
          'headers:', Object.fromEntries([...(newInit.headers as Headers).entries()]));
        
        return originalFetchRef.current.call(window, input, newInit);
      };

      // Create transport
      const newTransport = new StreamableHTTPClientTransport(
        new URL(serverUrl)
      );

      // Set up onclose handler to restore original fetch
      newTransport.onclose = () => {
        window.fetch = originalFetchRef.current;
        console.log("HTTP transport closed");
        setConnectionStatus("Connection Closed");
      };
      
      newTransport.onerror = (error) => {
        window.fetch = originalFetchRef.current;
        console.error("HTTP Transport Error:", error);
        setConnectionStatus(`Transport Error: ${error.message}`);
        setIsLoading(false);
      };

      // Set up notification handlers
      newClient.setNotificationHandler(LoggingMessageNotificationSchema, (notification) => {
        setNotificationCount((prev) => prev + 1);
        const message = `Notification #${notificationCount + 1}: ${notification.params.level} - ${notification.params.data}`;
        addOutput(message);
        setNotifications((prev) => [...prev, message]);
      });

      newClient.setNotificationHandler(ResourceListChangedNotificationSchema, async (notification) => {
        addOutput("Resource list changed notification received!");
        try {
          if (!newClient) {
            addOutput("Client disconnected, cannot fetch resources");
            return;
          }
          const resourcesResult = await newClient.request({ 
            method: "resources/list", 
            params: {} 
          }, ListResourcesResultSchema);
          
          setAvailableResources(resourcesResult.resources);
          addOutput(`Available resources count: ${resourcesResult.resources.length}`);
        } catch (error) {
          addOutput("Failed to list resources after change notification");
        }
      });

      // Connect the client
      await newClient.connect(newTransport);
      
      // Send initialization notification
      try {
        addOutput("Sending notifications/initialized");
        await newClient.notification({
          method: "notifications/initialized",
          params: {}
        });
        addOutput("Initialization notification sent successfully");
      } catch (error: any) {
        addOutput(`Failed to send initialization notification: ${error.message}`);
      }
      
      setConnectionStatus(`Connected (Session: ${currentSessionId})`);
      addOutput(`Connected to MCP server with session ID: ${currentSessionId}`);
      
      setClient(newClient);
      setTransport(newTransport);
      
      // Automatically fetch available tools
      await listTools(newClient);
      
    } catch (error: any) {
      addOutput(`Failed to connect: ${error.message}`);
      setConnectionStatus(`Connection Failed: ${error.message}`);
      setClient(null);
      setTransport(null);
      // Restore original fetch on error
      window.fetch = originalFetchRef.current;
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!client || !transport) {
      addOutput("Not connected.");
      return;
    }

    setIsLoading(true);
    try {
      await transport.close();
      addOutput("Disconnected from MCP server");
      setConnectionStatus("Disconnected");
      setClient(null);
      setTransport(null);
      // Restore original fetch
      window.fetch = originalFetchRef.current;
    } catch (error: any) {
      addOutput(`Error disconnecting: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTerminateSession = async () => {
    if (!client || !transport) {
      addOutput("Not connected.");
      return;
    }

    setIsLoading(true);
    try {
      addOutput(`Terminating session with ID: ${sessionId}`);
      await transport.terminateSession();
      addOutput("Session terminated successfully");

      // Also close the transport and clear client objects
      await transport.close();
      addOutput("Transport closed after session termination");
      setClient(null);
      setTransport(null);
      setConnectionStatus("Disconnected (Session Terminated)");
      // Restore original fetch
      window.fetch = originalFetchRef.current;
    } catch (error: any) {
      addOutput(`Error terminating session: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReconnect = async () => {
    if (client) {
      await handleDisconnect();
    }
    await handleConnect();
  };

  const listTools = async (clientToUse = client) => {
    if (!clientToUse) {
      addOutput("Not connected to server.");
      return;
    }

    setIsLoading(true);
    try {
      const toolsRequest: ListToolsRequest = {
        method: "tools/list",
        params: {},
      };
      const toolsResult = await clientToUse.request(toolsRequest, ListToolsResultSchema);
      
      setAvailableTools(toolsResult.tools);
      
      addOutput("Available tools:");
      if (toolsResult.tools.length === 0) {
        addOutput(" No tools available");
      } else {
        toolsResult.tools.forEach(tool => {
          addOutput(` - ${tool.name}: ${tool.description}`);
        });
      }
    } catch (error: any) {
      addOutput(`Tools not supported by this server (${error.message})`);
    } finally {
      setIsLoading(false);
    }
  };

  const callTool = async (name: string, argsStr: string) => {
    if (!client) {
      addOutput("Not connected to server.");
      return;
    }

    setIsLoading(true);
    try {
      let args = {};
      try {
        args = JSON.parse(argsStr);
      } catch (e) {
        addOutput("Invalid JSON arguments. Using empty args.");
      }

      const request: CallToolRequest = {
        method: "tools/call",
        params: { name, arguments: args },
      };
      
      addOutput(`Calling tool '${name}' with args: ${argsStr}`);
      
      const onLastEventIdUpdate = (event: string) => {
        setNotificationsToolLastEventId(event);
      };

      const result = await client.request(
        request,
        CallToolResultSchema,
        {
          resumptionToken: notificationsToolLastEventId,
          onresumptiontoken: onLastEventIdUpdate,
        }
      );

      addOutput("Tool result:");
      result.content?.forEach((item) => {
        if (item.type === "text") {
          addOutput(` ${item.text}`);
        } else {
          addOutput(` ${item.type} content: ${JSON.stringify(item)}`);
        }
      });
    } catch (error: any) {
      addOutput(`Error calling tool ${name}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const callGreetTool = async (name: string) => {
    await callTool("greet", JSON.stringify({ name }));
  };

  const callMultiGreetTool = async (name: string) => {
    addOutput("Calling multi-greet tool with notifications...");
    await callTool("multi-greet", JSON.stringify({ name }));
  };

  const startNotifications = async (interval: number, count: number) => {
    addOutput(`Starting notification stream: interval=${interval}ms, count=${count || "unlimited"}`);
    await callTool("start-notification-stream", JSON.stringify({ interval, count }));
  };

  const listPrompts = async () => {
    if (!client) {
      addOutput("Not connected to server.");
      return;
    }

    setIsLoading(true);
    try {
      const promptsRequest: ListPromptsRequest = {
        method: "prompts/list",
        params: {},
      };
      const promptsResult = await client.request(promptsRequest, ListPromptsResultSchema);
      
      setAvailablePrompts(promptsResult.prompts);
      
      addOutput("Available prompts:");
      if (promptsResult.prompts.length === 0) {
        addOutput(" No prompts available");
      } else {
        promptsResult.prompts.forEach(prompt => {
          addOutput(` - ${prompt.name}: ${prompt.description}`);
        });
      }
    } catch (error: any) {
      addOutput(`Prompts not supported by this server (${error.message})`);
    } finally {
      setIsLoading(false);
    }
  };

  const getPrompt = async (name: string, argsStr: string) => {
    if (!client) {
      addOutput("Not connected to server.");
      return;
    }

    setIsLoading(true);
    try {
      let args = {};
      try {
        args = JSON.parse(argsStr);
      } catch (e) {
        addOutput("Invalid JSON arguments. Using empty args.");
      }

      const promptRequest: GetPromptRequest = {
        method: "prompts/get",
        params: { 
          name, 
          arguments: args as Record<string, string>
        },
      };
      
      const promptResult = await client.request(promptRequest, GetPromptResultSchema);
      
      addOutput("Prompt template:");
      promptResult.messages.forEach((msg, index) => {
        addOutput(` [${index + 1}] ${msg.role}: ${msg.content.text}`);
      });
    } catch (error: any) {
      addOutput(`Error getting prompt ${name}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const listResources = async () => {
    if (!client) {
      addOutput("Not connected to server.");
      return;
    }

    setIsLoading(true);
    try {
      const resourcesRequest: ListResourcesRequest = {
        method: "resources/list",
        params: {},
      };
      const resourcesResult = await client.request(resourcesRequest, ListResourcesResultSchema);
      
      setAvailableResources(resourcesResult.resources);
      
      addOutput("Available resources:");
      if (resourcesResult.resources.length === 0) {
        addOutput(" No resources available");
      } else {
        resourcesResult.resources.forEach(resource => {
          addOutput(` - ${resource.name}: ${resource.uri}`);
        });
      }
    } catch (error: any) {
      addOutput(`Resources not supported by this server (${error.message})`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCommandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!command.trim()) return;
    
    addOutput(`> ${command}`);
    
    const args = command.trim().split(/\s+/);
    const cmd = args[0]?.toLowerCase();
    
    switch (cmd) {
      case "connect":
        await handleConnect(args[1]);
        break;
      case "disconnect":
        await handleDisconnect();
        break;
      case "terminate-session":
        await handleTerminateSession();
        break;
      case "reconnect":
        await handleReconnect();
        break;
      case "list-tools":
        await listTools();
        break;
      case "call-tool":
        if (args.length < 2) {
          addOutput("Usage: call-tool <tool_name> [args_json]");
        } else {
          const toolName = args[1];
          const toolArgs = args.length > 2 ? args.slice(2).join(" ") : "{}";
          await callTool(toolName, toolArgs);
        }
        break;
      case "greet":
        await callGreetTool(args[1] || "MCP User");
        break;
      case "multi-greet":
        await callMultiGreetTool(args[1] || "MCP User");
        break;
      case "start-notifications": {
        const interval = args[1] ? parseInt(args[1], 10) : 2000;
        const count = args[2] ? parseInt(args[2], 10) : 10;
        await startNotifications(interval, count);
        break;
      }
      case "list-prompts":
        await listPrompts();
        break;
      case "get-prompt":
        if (args.length < 2) {
          addOutput("Usage: get-prompt <prompt_name> [args_json]");
        } else {
          const promptName = args[1];
          const promptArgs = args.length > 2 ? args.slice(2).join(" ") : "{}";
          await getPrompt(promptName, promptArgs);
        }
        break;
      case "list-resources":
        await listResources();
        break;
      case "help":
        addOutput("Available commands:");
        addOutput(" connect [url] - Connect to MCP server (default: current URL)");
        addOutput(" disconnect - Disconnect from server");
        addOutput(" terminate-session - Terminate the current session");
        addOutput(" reconnect - Reconnect to the server");
        addOutput(" list-tools - List available tools");
        addOutput(" call-tool <tool_name> [args_json] - Call a tool with optional JSON arguments");
        addOutput(" greet [name] - Call the greet tool");
        addOutput(" multi-greet [name] - Call the multi-greet tool with notifications");
        addOutput(" start-notifications [interval] [count] - Start periodic notifications");
        addOutput(" list-prompts - List available prompts");
        addOutput(" get-prompt <prompt_name> [args_json] - Get a prompt with optional JSON arguments");
        addOutput(" list-resources - List available resources");
        addOutput(" clear - Clear the terminal output");
        addOutput(" help - Show this help");
        break;
      case "clear":
        clearOutput();
        break;
      default:
        if (cmd) {
          addOutput(`Unknown command: ${cmd}`);
          addOutput("Type 'help' for available commands");
        }
        break;
    }

    setCommand("");
  };
  
  // Quick tools for the UI
  const handleAddTool = async () => {
    await callTool("add", JSON.stringify({ a: 5, b: 7 }));
  };
  
  const handleSearchTool = async () => {
    await callTool("search", JSON.stringify({ query: "MCP protocol", count: 3 }));
  };

  return (
    <div className="p-6 m-4 border-0 rounded-xl shadow-xl bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm w-full">
      <h2 className="text-xl font-semibold mb-6 text-gray-700 dark:text-gray-200 flex items-center">
        <BrainCircuit className="mr-2" size={24} />
        MCP Interactive Client
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-4">
        <div className="col-span-1 md:col-span-3">
          <div className="flex mb-3">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              className="flex-grow px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm bg-white/80 dark:bg-gray-700/80 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              placeholder="Server URL"
              disabled={!!client}
            />
            <button
              onClick={() => handleConnect()}
              disabled={isLoading || !!client}
              className="px-5 py-2.5 bg-teal-500 text-white rounded-r-lg hover:bg-teal-600 disabled:bg-gray-400 transition-colors duration-200 flex items-center"
            >
              <PlugZap className="mr-2" size={18} />
              Connect
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <button
              onClick={() => handleDisconnect()}
              disabled={isLoading || !client}
              className="px-3 py-2.5 bg-rose-400 text-white rounded-lg text-sm hover:bg-rose-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
            >
              <WifiOff className="mr-1" size={16} />
              Disconnect
            </button>
            <button
              onClick={() => handleTerminateSession()}
              disabled={isLoading || !client}
              className="px-3 py-2.5 bg-amber-400 text-white rounded-lg text-sm hover:bg-amber-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
            >
              <ShieldAlert className="mr-1" size={16} />
              Terminate Session
            </button>
            <button
              onClick={() => listTools()}
              disabled={isLoading || !client}
              className="px-3 py-2.5 bg-emerald-400 text-white rounded-lg text-sm hover:bg-emerald-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
            >
              <List className="mr-1" size={16} />
              List Tools
            </button>
            <button
              onClick={() => clearOutput()}
              className="px-3 py-2.5 bg-gray-400 text-white rounded-lg text-sm hover:bg-gray-500 transition-colors duration-200 shadow-sm flex items-center justify-center"
            >
              <Terminal className="mr-1" size={16} />
              Clear Output
            </button>
          </div>
          
          {client && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              <button
                onClick={handleAddTool}
                disabled={isLoading}
                className="px-3 py-2.5 bg-teal-400 text-white rounded-lg text-sm hover:bg-teal-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
              >
                <Zap className="mr-1" size={16} />
                Add 5+7
              </button>
              <button
                onClick={handleSearchTool}
                disabled={isLoading}
                className="px-3 py-2.5 bg-teal-400 text-white rounded-lg text-sm hover:bg-teal-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
              >
                <Search className="mr-1" size={16} />
                Search "MCP protocol"
              </button>
              <button
                onClick={() => listPrompts()}
                disabled={isLoading}
                className="px-3 py-2.5 bg-teal-400 text-white rounded-lg text-sm hover:bg-teal-500 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
              >
                <List className="mr-1" size={16} />
                List Prompts
              </button>
            </div>
          )}

          <div className="mb-4">
            <div className="bg-gray-900/80 backdrop-blur-md p-5 rounded-lg h-80 overflow-y-auto font-mono text-sm shadow-inner border border-gray-700/50">
              {output.map((message, i) => (
                <div key={i} className={getMessageClasses(message.type)}>
                  {getMessageIcon(message.type)}
                  <span>{message.text}</span>
                  <span className="text-gray-500 text-xs ml-auto pl-2 flex-shrink-0">
                    {message.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'})}
                  </span>
                </div>
              ))}
              <div ref={outputEndRef} />
            </div>
            <form onSubmit={handleCommandSubmit} className="flex mt-3">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                className="flex-grow px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-l-lg text-sm bg-white/80 dark:bg-gray-700/80 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                placeholder="Enter command (type 'help' for available commands)"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading}
                className="px-5 py-2.5 bg-teal-500 text-white rounded-r-lg hover:bg-teal-600 disabled:bg-gray-400 transition-colors duration-200 flex items-center"
              >
                <Terminal className="mr-2" size={18} />
                Run
              </button>
            </form>
          </div>
        </div>

        <div className="col-span-1">
          <div className="p-4 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-600/50">
            <div className="flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-700 dark:text-gray-300 text-sm font-medium">Status</span>
                <div className={`px-2.5 py-0.5 rounded-full text-xs font-medium flex items-center 
                  ${client 
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'}`}>
                  <div className={`w-2 h-2 rounded-full mr-1.5 ${client ? 'bg-emerald-500' : 'bg-gray-500'}`}></div>
                  {client ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              
              {client && (
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-1">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700 dark:text-gray-300 text-sm flex items-center">
                      <Plug size={14} className="mr-1" /> Session
                    </span>
                    <button 
                      onClick={() => {
                        if (sessionId) {
                          navigator.clipboard.writeText(sessionId);
                          addOutput("Session ID copied to clipboard");
                        }
                      }}
                      disabled={!sessionId}
                      className="text-xs text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 flex items-center"
                      title="Copy session ID to clipboard"
                    >
                      Copy ID
                    </button>
                  </div>
                  {sessionId && (
                    <div className="mt-1 text-xs font-mono bg-gray-200/70 dark:bg-gray-600/70 p-1.5 rounded truncate hover:overflow-visible hover:whitespace-normal transition-all duration-200 cursor-pointer" 
                      title={sessionId}
                      onClick={() => {
                        navigator.clipboard.writeText(sessionId);
                        addOutput("Session ID copied to clipboard");
                      }}>
                      {sessionId}
                    </div>
                  )}
                </div>
              )}
              
              {notifications.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-600 pt-2 mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-gray-700 dark:text-gray-300 text-sm flex items-center">
                      <AlertCircle size={14} className="mr-1" /> Notifications
                    </span>
                    <span className="bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300 px-2 py-0.5 rounded-full text-xs font-medium">
                      {notifications.length}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tool Calling Panel */}
          {client && (
            <div className="mt-4 p-4 bg-gray-100/80 dark:bg-gray-700/80 backdrop-blur-sm rounded-lg shadow-sm border border-gray-200/50 dark:border-gray-600/50">
              <h3 className="font-medium mb-3 text-gray-700 dark:text-gray-200 flex items-center">
                <Zap size={16} className="mr-2" />
                Quick Tool Call
              </h3>
              
              <select
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                className="w-full mb-3 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white/80 dark:bg-gray-600/80 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
              >
                <option value="">Select a tool</option>
                {availableTools.map((tool) => (
                  <option key={tool.name} value={tool.name}>
                    {tool.name}
                  </option>
                ))}
              </select>
              
              <textarea
                value={toolArgs}
                onChange={(e) => setToolArgs(e.target.value)}
                className="w-full mb-3 px-3 py-2.5 border border-gray-200 dark:border-gray-600 rounded-lg text-sm bg-white/80 dark:bg-gray-600/80 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                placeholder="Arguments (JSON)"
                rows={3}
              />
              
              <button
                onClick={() => callTool(toolName, toolArgs)}
                disabled={isLoading || !toolName}
                className="w-full px-4 py-2.5 bg-teal-500 text-white rounded-lg text-sm hover:bg-teal-600 disabled:bg-gray-400 transition-colors duration-200 shadow-sm flex items-center justify-center"
              >
                <Zap className="mr-2" size={18} />
                Call Tool
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 