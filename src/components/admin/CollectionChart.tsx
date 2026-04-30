'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

interface ChartDay {
  label: string;
  amount: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-lg px-3 py-2.5 text-sm">
      <p className="text-muted-foreground text-xs mb-1">{label}</p>
      <p className="font-bold text-gray-900">LKR {payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export default function CollectionChart({ data }: { data: ChartDay[] }) {
  const max = Math.max(...data.map(d => d.amount), 1);

  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} barSize={28} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => v === 0 ? '0' : `${(v / 1000).toFixed(0)}k`}
          domain={[0, Math.ceil(max * 1.15)]}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f1f5f9', radius: 6 }} />
        <Bar
          dataKey="amount"
          fill="#3b82f6"
          radius={[6, 6, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
