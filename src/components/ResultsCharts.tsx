import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface SampleRow {
  s_m: number;
  speed_kmh: number;
  lat_g: number;
  long_g: number;
  safety_score: number;
  fuel_lps: number;
}

export function ResultsCharts({ samples }: { samples: SampleRow[] }) {
  const data = samples.map((s) => ({ ...s, s_km: +(s.s_m / 1000).toFixed(3) }));
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <Chart title="Speed (km/h)" data={data} y="speed_kmh" color="oklch(0.78 0.14 195)" />
      <Chart title="Lateral acceleration (g)" data={data} y="lat_g" color="oklch(0.78 0.17 75)" />
      <Chart
        title="Longitudinal acceleration (g)"
        data={data}
        y="long_g"
        color="oklch(0.62 0.18 260)"
      />
      <Chart title="Safety score" data={data} y="safety_score" color="oklch(0.7 0.18 155)" />
      <Chart title="Fuel rate (L/s)" data={data} y="fuel_lps" color="oklch(0.62 0.22 25)" />
    </div>
  );
}

function Chart({
  title,
  data,
  y,
  color,
}: {
  title: string;
  data: (SampleRow & { s_km: number })[];
  y: keyof SampleRow;
  color: string;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="oklch(0.3 0.02 240 / 0.3)" strokeDasharray="2 4" />
            <XAxis
              dataKey="s_km"
              stroke="oklch(0.7 0.02 240)"
              fontSize={11}
              tickFormatter={(v) => `${v} km`}
            />
            <YAxis stroke="oklch(0.7 0.02 240)" fontSize={11} width={50} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.22 0.02 240)",
                border: "1px solid oklch(0.32 0.02 240)",
                fontSize: 12,
              }}
              labelFormatter={(v) => `${v} km`}
            />
            <Legend wrapperStyle={{ display: "none" }} />
            <Line
              type="monotone"
              dataKey={y}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
