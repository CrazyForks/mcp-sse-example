import React, { useState } from "react";
import { BraveSearch } from "./components/BraveSearch"; // Uncommented BraveSearch
import { McpInteractiveClient } from "./components/McpInteractiveClient";

function App() {
  const [activeComponent, setActiveComponent] = useState<"search" | "client">("search");

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col items-center justify-start p-4 space-y-8 pt-8">
      <div className="absolute top-4 right-4 w-full max-w-full flex justify-end mb-4">
        <div className="bg-white dark:bg-gray-800 rounded-full p-1 flex shadow-md">
          <button
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              activeComponent === "search"
                ? "bg-teal-500 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            onClick={() => setActiveComponent("search")}
          >
            Search
          </button>
          <button
            className={`px-6 py-2 rounded-full font-medium transition-all ${
              activeComponent === "client"
                ? "bg-teal-500 text-white"
                : "text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            onClick={() => setActiveComponent("client")}
          >
            Interactive Client
          </button>
        </div>
      </div>
      
      <div className="w-full max-w-6xl">
        {activeComponent === "search" ? (
          <BraveSearch />
        ) : (
          <McpInteractiveClient />
        )}
      </div>
    </div>
  );
}

export default App;
