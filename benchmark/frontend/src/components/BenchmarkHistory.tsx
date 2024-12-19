import React, { useState, useEffect } from 'react';
import { Activity, Calendar, Clock, Download } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const StatusBadge = ({ status }) => {
  const colors = {
    completed: 'bg-green-900 text-green-300',
    running: 'bg-blue-900 text-blue-300',
    failed: 'bg-red-900 text-red-300',
    stopped: 'bg-yellow-900 text-yellow-300'
  };

  return (
    <span className={`px-2 py-1 rounded-full text-sm ${colors[status] || colors.failed}`}>
      {status}
    </span>
  );
};

const BenchmarkHistory = () => {
  const [history, setHistory] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    try {
      const response = await fetch('/api/benchmark/history');
      const data = await response.json();
      setHistory(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching history:', error);
      setLoading(false);
    }
  };

  const fetchRunDetails = async (runId) => {
    try {
      const response = await fetch(`/api/benchmark/history/${runId}`);
      const data = await response.json();
      setSelectedRun(data);
    } catch (error) {
      console.error('Error fetching run details:', error);
    }
  };

  const exportResults = async (runId) => {
    try {
      const response = await fetch(`/api/benchmark/history/${runId}/export`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `benchmark-${runId}-results.json`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting results:', error);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg">
        <div className="text-center text-gray-400">Loading benchmark history...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* History List */}
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-4">Benchmark History</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-gray-700">
                <th className="pb-3">Model</th>
                <th className="pb-3">Status</th>
                <th className="pb-3">Started</th>
                <th className="pb-3">Duration</th>
                <th className="pb-3">Avg TPS</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => (
                <tr
                  key={run.id}
                  className="border-b border-gray-700 cursor-pointer hover:bg-gray-700"
                  onClick={() => fetchRunDetails(run.id)}
                >
                  <td className="py-4">{run.model_name}</td>
                  <td className="py-4">
                    <StatusBadge status={run.status} />
                  </td>
                  <td className="py-4">
                    {new Date(run.start_time).toLocaleString()}
                  </td>
                  <td className="py-4">
                    {run.end_time ? 
                      `${Math.round((new Date(run.end_time) - new Date(run.start_time)) / 1000)}s` 
                      : 'Running'}
                  </td>
                  <td className="py-4">
                    {run.metrics?.average_tps?.toFixed(2) || 'N/A'}
                  </td>
                  <td className="py-4">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        exportResults(run.id);
                      }}
                      className="p-2 hover:bg-gray-600 rounded"
                    >
                      <Download className="w-5 h-5 text-[#76B900]" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Selected Run Details */}
      {selectedRun && (
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Run Details</h2>
          
          {/* Performance Graph */}
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={selectedRun.metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="timestamp"
                  stroke="#9CA3AF"
                  tickFormatter={(time) => new Date(time).toLocaleTimeString()}
                />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none' }}
                  labelStyle={{ color: '#9CA3AF' }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="tokens_per_second"
                  stroke="#76B900"
                  strokeWidth={2}
                  dot={false}
                  name="TPS"
                />
                <Line
                  type="monotone"
                  dataKey="latency"
                  stroke="#60A5FA"
                  strokeWidth={2}
                  dot={false}
                  name="Latency"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            <div className="bg-gray-900 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Total Requests</span>
                <Activity className="w-5 h-5 text-[#76B900]" />
              </div>
              <div className="text-2xl font-bold mt-2">
                {selectedRun.metrics.total_requests}
              </div>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Average TPS</span>
                <Activity className="w-5 h-5 text-[#76B900]" />
              </div>
              <div className="text-2xl font-bold mt-2">
                {selectedRun.metrics.average_tps?.toFixed(2)}
              </div>
            </div>
            <div className="bg-gray-900 p-4 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-400">P95 Latency</span>
                <Activity className="w-5 h-5 text-[#76B900]" />
              </div>
              <div className="text-2xl font-bold mt-2">
                {selectedRun.metrics.p95_latency?.toFixed(2)}ms
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BenchmarkHistory;