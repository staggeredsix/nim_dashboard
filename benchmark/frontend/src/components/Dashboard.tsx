import React, { useState } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { Activity, Database, Cpu, Settings, Circle, BarChart } from 'lucide-react';

const getPerformanceColor = (value, metric) => {
  // Performance thresholds for different metrics
  const thresholds = {
    tps: { low: 20, medium: 40 },
    ttft: { low: 500, medium: 300 }, // Lower is better
    latency: { low: 100, medium: 50 } // Lower is better
  };

  // Invert logic for metrics where lower is better
  if (metric === 'ttft' || metric === 'latency') {
    if (value > thresholds[metric].low) return '#EF4444'; // Red
    if (value > thresholds[metric].medium) return '#FBBF24'; // Yellow
    return '#76B900'; // NVIDIA Green
  }
  
  // Normal logic for metrics where higher is better
  if (value < thresholds[metric].low) return '#EF4444'; // Red
  if (value < thresholds[metric].medium) return '#FBBF24'; // Yellow
  return '#76B900'; // NVIDIA Green
}
const GaugeChart = ({ value, max, title, color, icon: Icon }) => {
  const data = [
    { value: value },
    { value: max - value }
  ];
  
  const startAngle = 180;
  const endAngle = 0;

  return (
    <div className="relative flex flex-col items-center">
      <div className="w-48 h-24">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="100%"
              startAngle={startAngle}
              endAngle={endAngle}
              innerRadius={60}
              outerRadius={80}
              cornerRadius={5}
              paddingAngle={2}
              dataKey="value"
            >
              <Cell fill={color} />
              <Cell fill="#1F2937" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col items-center mt-4">
        <div className="flex items-center space-x-2 text-gray-400 mb-1">
          <Icon className="w-4 h-4" />
          <span>{title}</span>
        </div>
        <span className="text-2xl font-bold">{value}{typeof max === 'number' ? '%' : ''}</span>
      </div>
    </div>
  );
};

// SystemMetrics Component
const SystemMetrics = () => {
  // Track metrics over time for steady-state calculation
  const [metrics, setMetrics] = useState({
    tps: 48.5,
    temperature: 65,
    cpuUsage: 75,
    gpuUsage: 85,
    dramUsage: 60,
    vramUsage: 80,
    ttft: 245,
    latency: 42,
    history: {
      tps: [],
      ttft: [],
      latency: []
    }
  });

  // Update metrics every second
  useEffect(() => {
    const interval = setInterval(() => {
      setMetrics(prev => {
        // Keep last 60 seconds of history
        const newHistory = {
          tps: [...prev.history.tps.slice(-59), prev.tps],
          ttft: [...prev.history.ttft.slice(-59), prev.ttft],
          latency: [...prev.history.latency.slice(-59), prev.latency]
        };

        // Calculate moving averages for steady state
        const movingAvg = {
          tps: newHistory.tps.reduce((a, b) => a + b, 0) / newHistory.tps.length,
          ttft: newHistory.ttft.reduce((a, b) => a + b, 0) / newHistory.ttft.length,
          latency: newHistory.latency.reduce((a, b) => a + b, 0) / newHistory.latency.length
        };

        // Simulate some variation in metrics
        return {
          ...prev,
          tps: movingAvg.tps + (Math.random() - 0.5) * 5,
          ttft: movingAvg.ttft + (Math.random() - 0.5) * 20,
          latency: movingAvg.latency + (Math.random() - 0.5) * 2,
          history: newHistory
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-bold mb-6">System Metrics</h2>
      {/* TPS, TTFT, and Inter-Token Latency Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8 mt-2">
        {/* TPS Gauge */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.tps}
            max={100}
            title="Tokens/Second"
            color={getPerformanceColor(metrics.tps, 'tps')}
            icon={BarChart}
          />
          <div className="mt-4 text-sm text-gray-400">
            Peak: 52.3 TPS
          </div>
        </div>

        {/* Time to First Token */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={245}
            max={1000}
            title="Time to First Token"
            color={getPerformanceColor(245, 'ttft')}
            icon={Activity}
          />
          <div className="mt-4 text-sm text-gray-400">
            245ms (avg)
          </div>
        </div>

        {/* Inter-Token Latency */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={42}
            max={200}
            title="Inter-Token Latency"
            color={getPerformanceColor(42, 'latency')}
            icon={Activity}
          />
          <div className="mt-4 text-sm text-gray-400">
            42ms per token
          </div>
        </div>
      </div>

      {/* System Resources */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* Temperature Gauge */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.temperature}
            max={100}
            title="GPU Temperature"
            color={metrics.temperature > 80 ? '#EF4444' : '#76B900'}
            icon={Activity}
          />
          <div className="mt-4 text-sm text-gray-400">
            Max: 85°C
          </div>
        </div>

        {/* CPU Usage */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.cpuUsage}
            max={100}
            title="CPU Usage"
            color={metrics.cpuUsage > 90 ? '#EF4444' : '#76B900'}
            icon={Cpu}
          />
          <div className="mt-4 text-sm text-gray-400">
            16 Cores Active
          </div>
        </div>

        {/* GPU Usage */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.gpuUsage}
            max={100}
            title="GPU Usage"
            color={metrics.gpuUsage > 90 ? '#EF4444' : '#76B900'}
            icon={Cpu}
          />
          <div className="mt-4 text-sm text-gray-400">
            NVIDIA A100
          </div>
        </div>

        {/* DRAM Usage */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.dramUsage}
            max={100}
            title="DRAM Usage"
            color={metrics.dramUsage > 90 ? '#EF4444' : '#76B900'}
            icon={Database}
          />
          <div className="mt-4 text-sm text-gray-400">
            48GB / 64GB Used
          </div>
        </div>

        {/* VRAM Usage */}
        <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
          <GaugeChart
            value={metrics.vramUsage}
            max={100}
            title="VRAM Usage"
            color={metrics.vramUsage > 90 ? '#EF4444' : '#76B900'}
            icon={Database}
          />
          <div className="mt-4 text-sm text-gray-400">
            32GB / 40GB Used
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component
const DashboardLayout = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Sample data - this would come from your benchmark results
  const performanceData = [
    { timestamp: '00:00', tps: 45, requests: 200, latency: 120 },
    { timestamp: '00:10', tps: 48, requests: 220, latency: 115 },
    { timestamp: '00:20', tps: 52, requests: 240, latency: 110 },
    { timestamp: '00:30', tps: 49, requests: 230, latency: 118 },
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Navigation */}
      <nav className="bg-[#76B900] p-4">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">NIM Benchmark Dashboard</h1>
          <div className="flex items-center space-x-4">
            <button className="px-4 py-2 bg-black/20 rounded hover:bg-black/30">
              New Test
            </button>
            <Settings className="w-6 h-6 cursor-pointer" />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="container mx-auto p-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-400">Active Tests</h3>
              <Activity className="w-6 h-6 text-[#76B900]" />
            </div>
            <p className="text-3xl font-bold mt-2">3</p>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-400">Total Benchmarks</h3>
              <Database className="w-6 h-6 text-[#76B900]" />
            </div>
            <p className="text-3xl font-bold mt-2">156</p>
          </div>
          
          <div className="bg-gray-800 p-6 rounded-lg">
            <div className="flex items-center justify-between">
              <h3 className="text-gray-400">Active NIMs</h3>
              <Cpu className="w-6 h-6 text-[#76B900]" />
            </div>
            <p className="text-3xl font-bold mt-2">8</p>
          </div>
        </div>

        {/* System Metrics */}
        <div className="mb-8">
          <SystemMetrics />
        </div>

        {/* Performance Graph */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-bold mb-4">Performance Overview</h2>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={performanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="timestamp" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1F2937', border: 'none' }}
                  labelStyle={{ color: '#9CA3AF' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="tps" 
                  stroke="#76B900" 
                  strokeWidth={2}
                  dot={false}
                />
                <Line 
                  type="monotone" 
                  dataKey="requests" 
                  stroke="#60A5FA" 
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Active Tests */}
        <div className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-bold mb-4">Active Tests</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-700">
                  <th className="pb-3">Model</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3">TPS</th>
                  <th className="pb-3">Duration</th>
                  <th className="pb-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-gray-700">
                  <td className="py-4">llama3-8b-instruct</td>
                  <td className="py-4">
                    <span className="px-2 py-1 bg-green-900 text-green-300 rounded-full text-sm">
                      Running
                    </span>
                  </td>
                  <td className="py-4">48.5</td>
                  <td className="py-4">15m 23s</td>
                  <td className="py-4">
                    <button className="p-2 hover:bg-gray-700 rounded">
                      <Circle className="w-5 h-5 text-[#76B900]" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardLayout;