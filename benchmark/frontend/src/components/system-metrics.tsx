import React from 'react';
import { Activity, Database, Cpu, BarChart } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';

const GaugeChart = ({ value, max, title, color, icon: Icon }) => {
  const data = [
    { value: value },
    { value: max - value }
  ];
  
  return (
    <div className="flex flex-col items-center bg-gray-900 rounded-lg p-4">
      <div className="w-48 h-24 relative">
        <svg viewBox="0 0 100 100" className="transform -rotate-90">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="#1F2937"
            strokeWidth="10"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke={color}
            strokeWidth="10"
            strokeDasharray={`${value * 2.83} 283`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <Icon className="w-6 h-6 mb-2" />
          <span className="text-lg font-bold">{value.toFixed(2)}</span>
        </div>
      </div>
      <div className="mt-4 text-gray-400">{title}</div>
    </div>
  );
};

const SystemMetrics = () => {
  const { metrics, isConnected } = useWebSocket('ws://localhost:8000/ws');
  const systemMetrics = metrics?.system;
  const benchmarkMetrics = metrics?.benchmark;

  if (!isConnected || !systemMetrics) {
    return (
      <div className="bg-gray-800 p-6 rounded-lg">
        <h2 className="text-xl font-bold mb-6">System Metrics</h2>
        <div className="text-center text-gray-400">
          Connecting to metrics service...
        </div>
      </div>
    );
  }

  // Get first GPU metrics
  const gpuMetrics = Object.values(systemMetrics.gpus)[0] || {};

  const getPerformanceColor = (value, type) => {
    if (type === 'temperature') {
      return value > 80 ? '#EF4444' : value > 60 ? '#FBBF24' : '#76B900';
    }
    return value > 90 ? '#EF4444' : value > 70 ? '#FBBF24' : '#76B900';
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-bold mb-6">System Metrics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {/* TPS Gauge */}
        <GaugeChart
          value={benchmarkMetrics?.tokens_per_second || 0}
          max={100}
          title="Tokens/Second"
          color={getPerformanceColor(benchmarkMetrics?.tokens_per_second || 0, 'tps')}
          icon={BarChart}
        />

        {/* GPU Temperature */}
        <GaugeChart
          value={gpuMetrics.temperature || 0}
          max={100}
          title="GPU Temperature"
          color={getPerformanceColor(gpuMetrics.temperature || 0, 'temperature')}
          icon={Activity}
        />

        {/* GPU Usage */}
        <GaugeChart
          value={gpuMetrics.utilization || 0}
          max={100}
          title="GPU Utilization"
          color={getPerformanceColor(gpuMetrics.utilization || 0, 'usage')}
          icon={Cpu}
        />

        {/* Memory Usage */}
        <GaugeChart
          value={(systemMetrics.memory_used / systemMetrics.memory_total) * 100}
          max={100}
          title="System Memory"
          color={getPerformanceColor(
            (systemMetrics.memory_used / systemMetrics.memory_total) * 100,
            'memory'
          )}
          icon={Database}
        />

        {/* GPU Memory */}
        <GaugeChart
          value={(gpuMetrics.memory_used / gpuMetrics.memory_total) * 100}
          max={100}
          title="GPU Memory"
          color={getPerformanceColor(
            (gpuMetrics.memory_used / gpuMetrics.memory_total) * 100,
            'memory'
          )}
          icon={Database}
        />
      </div>
    </div>
  );
};

export default SystemMetrics;