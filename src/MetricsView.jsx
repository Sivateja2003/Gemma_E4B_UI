import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  LineChart, Line,
  BarChart, Bar,
  AreaChart, Area,
  XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Zap, Clock, DollarSign, TrendingUp, LayoutDashboard, Trash2, Sun, Moon } from 'lucide-react';

const INR_RATE = 84.5;

const MODEL_OPTIONS = [
  { value: 'all', label: 'All Models' },
  { value: 'gemma', label: 'Gemma' },
  { value: 'gpt4', label: 'GPT-4' },
];

const TOOLTIP_STYLE = {
  backgroundColor: '#1a1a1e',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '8px',
  color: '#f0f0f2',
  fontSize: '0.8rem',
  padding: '8px 12px',
};

const LABEL_STYLE = { color: '#9ca3af', marginBottom: 4 };

function fmt(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function MetricCard({ icon: Icon, label, value, sub, color, gradient }) {
  return (
    <div className="metric-card" style={{ '--card-color': color }}>
      <div className="metric-card-icon" style={{ background: gradient }}>
        <Icon size={18} />
      </div>
      <div className="metric-card-body">
        <p className="metric-card-label">{label}</p>
        <p className="metric-card-value">{value}</p>
        {sub && <p className="metric-card-sub">{sub}</p>}
      </div>
    </div>
  );
}

export default function MetricsView({ metrics, onClearMetrics, theme, setTheme }) {
  const [selectedModel, setSelectedModel] = useState('all');

  const filtered = useMemo(() =>
    selectedModel === 'all'
      ? metrics
      : metrics.filter(m => (m.model ?? 'gemma') === selectedModel),
  [metrics, selectedModel]);

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const totalPrompt = filtered.reduce((s, m) => s + m.prompt_tokens, 0);
    const totalCompletion = filtered.reduce((s, m) => s + m.completion_tokens, 0);
    const latencies = filtered.map(m => m.latency_ms);
    const avgLatency = latencies.reduce((s, v) => s + v, 0) / latencies.length;
    const totalCostUsd = filtered.reduce((s, m) => s + m.cost_usd, 0);
    return {
      totalPrompt,
      totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      avgLatency,
      minLatency: Math.min(...latencies),
      maxLatency: Math.max(...latencies),
      totalCostUsd,
      totalCostInr: totalCostUsd * INR_RATE,
      avgCostUsd: totalCostUsd / filtered.length,
    };
  }, [filtered]);

  const chartData = useMemo(() =>
    filtered.slice(-30).map((m, i) => ({
      name: `#${filtered.length - Math.min(30, filtered.length) + i + 1}`,
      prompt: m.prompt_tokens,
      completion: m.completion_tokens,
      latency: Math.round(m.latency_ms),
      cost: parseFloat((m.cost_usd * 1_000_000).toFixed(3)),
    })),
  [filtered]);

  const handleClear = () => {
    if (window.confirm('Clear all dashboard metrics data?')) onClearMetrics();
  };

  return (
    <main className="metrics-main">
      <header className="metrics-header">
        <div className="metrics-header-title">
          <div className="header-title-icon"><LayoutDashboard size={16} /></div>
          <h1>DASHBOARD</h1>
        </div>
        <div className="metrics-header-actions">
          <button
            onClick={() => setTheme(prev => prev === 'dark' ? 'light' : 'dark')}
            className="theme-toggle-btn"
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
            style={{ padding: '5px' }}
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
          <select
            className="model-select"
            value={selectedModel}
            onChange={e => setSelectedModel(e.target.value)}
          >
            {MODEL_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {metrics.length > 0 && (
            <button className="metrics-clear-btn" onClick={handleClear}>
              <Trash2 size={14} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </header>

      <div className="metrics-body">
        {!metrics.length ? (
          <div className="metrics-empty">
            <LayoutDashboard size={48} strokeWidth={1} />
            <p>No data yet — send a message to start tracking metrics.</p>
          </div>
        ) : !filtered.length ? (
          <div className="metrics-empty">
            <LayoutDashboard size={48} strokeWidth={1} />
            <p>No requests found for this model yet.</p>
          </div>
        ) : (
          <>
            {/* ===== Metric Cards ===== */}
            <div className="metric-cards-grid">
              <MetricCard
                icon={Zap}
                label="Total Tokens"
                value={fmt(stats.totalTokens)}
                sub={`${fmt(stats.totalPrompt)} in · ${fmt(stats.totalCompletion)} out`}
                color="#7c6df0"
                gradient="linear-gradient(135deg, #7c6df0, #c084fc)"
              />
              <MetricCard
                icon={Clock}
                label="Avg Latency"
                value={`${Math.round(stats.avgLatency)} ms`}
                sub={`Min ${Math.round(stats.minLatency)} · Max ${Math.round(stats.maxLatency)} ms`}
                color="#34d399"
                gradient="linear-gradient(135deg, #10b981, #34d399)"
              />
              <MetricCard
                icon={DollarSign}
                label="Total Cost (USD)"
                value={`$${stats.totalCostUsd < 0.0001
                  ? stats.totalCostUsd.toExponential(2)
                  : stats.totalCostUsd.toFixed(6)}`}
                sub={`${filtered.length} request${filtered.length !== 1 ? 's' : ''} · avg $${stats.avgCostUsd.toExponential(2)}`}
                color="#f59e0b"
                gradient="linear-gradient(135deg, #d97706, #f59e0b)"
              />
              <MetricCard
                icon={TrendingUp}
                label="Total Cost (INR)"
                value={`₹${stats.totalCostInr.toFixed(4)}`}
                sub={`Rate ₹${INR_RATE}/USD`}
                color="#fb923c"
                gradient="linear-gradient(135deg, #ea580c, #fb923c)"
              />
            </div>

            {/* ===== Charts ===== */}
            <div className="metrics-charts">
              <div className="metrics-chart-card">
                <h3 className="chart-title">Token Usage per Request</h3>
                <ResponsiveContainer width="100%" height={210}>
                  <LineChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} />
                    <Legend wrapperStyle={{ fontSize: '0.78rem', paddingTop: '8px' }} />
                    <Line type="monotone" dataKey="prompt" name="Input" stroke="#7c6df0" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#7c6df0' }} />
                    <Line type="monotone" dataKey="completion" name="Output" stroke="#c084fc" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: '#c084fc' }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="metrics-chart-card">
                <h3 className="chart-title">Response Latency (ms)</h3>
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} formatter={(v) => [`${v} ms`, 'Latency']} />
                    <Bar dataKey="latency" name="Latency" fill="#34d399" radius={[3, 3, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="metrics-chart-card">
                <h3 className="chart-title">Cost per Request (µUSD)</h3>
                <ResponsiveContainer width="100%" height={210}>
                  <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="name" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} labelStyle={LABEL_STYLE} formatter={(v) => [`${v} µ$`, 'Cost']} />
                    <Area type="monotone" dataKey="cost" name="Cost" stroke="#f59e0b" strokeWidth={2} fill="url(#costGrad)" dot={false} activeDot={{ r: 3, fill: '#f59e0b' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
