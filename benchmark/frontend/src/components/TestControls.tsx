import React, { useState } from 'react';
import { Settings, Play, Plus } from 'lucide-react';

const TestControls = ({ onStartTest }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [testConfig, setTestConfig] = useState({
    totalRequests: 100,
    concurrencyLevel: 10,
    maxTokens: 100,
    timeout: 30,
    selectedGPUs: 'all'
  });
  
  const [showNimAdd, setShowNimAdd] = useState(false);
  const [newNim, setNewNim] = useState({
    name: '',
    image: ''
  });

  const handleStartTest = () => {
    onStartTest(testConfig);
    setShowConfig(false);
  };

  const handleAddNim = () => {
    // Add NIM implementation
    setShowNimAdd(false);
    setNewNim({ name: '', image: '' });
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg mb-8">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold">Test Configuration</h2>
        <div className="flex space-x-4">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            <Settings className="w-5 h-5 text-[#76B900]" />
          </button>
          <button
            onClick={() => setShowNimAdd(!showNimAdd)}
            className="p-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            <Plus className="w-5 h-5 text-[#76B900]" />
          </button>
        </div>
      </div>

      {showConfig && (
        <div className="bg-gray-900 p-4 rounded-lg mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-gray-400 mb-2">Total Requests</label>
              <input
                type="number"
                value={testConfig.totalRequests}
                onChange={(e) => setTestConfig({
                  ...testConfig,
                  totalRequests: parseInt(e.target.value)
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-2">Concurrency Level</label>
              <input
                type="number"
                value={testConfig.concurrencyLevel}
                onChange={(e) => setTestConfig({
                  ...testConfig,
                  concurrencyLevel: parseInt(e.target.value)
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-2">Max Tokens</label>
              <input
                type="number"
                value={testConfig.maxTokens}
                onChange={(e) => setTestConfig({
                  ...testConfig,
                  maxTokens: parseInt(e.target.value)
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-2">GPUs</label>
              <input
                type="text"
                value={testConfig.selectedGPUs}
                placeholder="all, 0, 0,1"
                onChange={(e) => setTestConfig({
                  ...testConfig,
                  selectedGPUs: e.target.value
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
              />
            </div>
          </div>
          <button
            onClick={handleStartTest}
            className="w-full bg-[#76B900] text-white p-2 rounded-lg hover:bg-[#5c9100] flex items-center justify-center space-x-2"
          >
            <Play className="w-5 h-5" />
            <span>Start Test</span>
          </button>
        </div>
      )}

      {showNimAdd && (
        <div className="bg-gray-900 p-4 rounded-lg">
          <div className="grid grid-cols-1 gap-4 mb-4">
            <div>
              <label className="block text-gray-400 mb-2">NIM Name</label>
              <input
                type="text"
                value={newNim.name}
                onChange={(e) => setNewNim({
                  ...newNim,
                  name: e.target.value
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
                placeholder="e.g., llama3-8b-instruct"
              />
            </div>
            <div>
              <label className="block text-gray-400 mb-2">Docker Image</label>
              <input
                type="text"
                value={newNim.image}
                onChange={(e) => setNewNim({
                  ...newNim,
                  image: e.target.value
                })}
                className="w-full bg-gray-800 text-white p-2 rounded"
                placeholder="e.g., nvcr.io/nim/meta/llama3-8b-instruct:latest"
              />
            </div>
          </div>
          <button
            onClick={handleAddNim}
            className="w-full bg-[#76B900] text-white p-2 rounded-lg hover:bg-[#5c9100]"
          >
            Add NIM
          </button>
        </div>
      )}
    </div>
  );
};

export default TestControls;