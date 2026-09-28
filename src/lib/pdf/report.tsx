/**
 * VirtuDrive AI — Professional Engineering PDF Report.
 *
 * Multi-page A4 portrait report with cover, executive summary, KPI dashboard,
 * SVG charts (speed, G, safety, fuel, elevation), 3D snapshot, limiting events
 * table, AI recommendations, engineering equations and appendix.
 *
 * All simulation math / physics / AI values are consumed as-is — this module
 * is presentation only.
 */
import "./buffer-polyfill";
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Svg,
  Line,
  Path,
  Rect,
  G,
  Polyline,
  Image as PdfImage,
} from "@react-pdf/renderer";
import type { SimResults, SimSample, SafeSegmentRow } from "@/lib/physics/simulation";
import { LIMIT_LABEL } from "@/lib/physics/simulation";
import type { predictFromResults } from "@/lib/ai/heuristics";
import type { AIExplanation } from "@/lib/ai/explain.functions";

/* ────────────────────────────  Colours & style  ──────────────────────────── */

const C = {
  ink: "#0f172a",
  ink2: "#334155",
  mute: "#64748b",
  faint: "#94a3b8",
  line: "#e2e8f0",
  card: "#f8fafc",
  brand: "#0e7490",
  brandDark: "#0b5a6f",
  accent: "#7c3aed",
  ok: "#059669",
  warn: "#d97706",
  high: "#ea580c",
  crit: "#dc2626",
  white: "#ffffff",
} as const;

const s = StyleSheet.create({
  page: {
    paddingTop: 64,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.ink,
    backgroundColor: C.white,
  },
  cover: { padding: 0, fontFamily: "Helvetica", color: C.ink, backgroundColor: C.white },
  h1: { fontSize: 22, fontWeight: "bold", color: C.ink },
  h2: {
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 14,
    marginBottom: 8,
    color: C.brandDark,
    borderBottomWidth: 1.5,
    borderBottomColor: C.brand,
    paddingBottom: 3,
  },
  h3: { fontSize: 10.5, fontWeight: "bold", marginTop: 8, marginBottom: 4, color: C.ink },
  body: { fontSize: 9.5, lineHeight: 1.5, color: C.ink2 },
  small: { fontSize: 8.5, color: C.mute },
  tiny: { fontSize: 7.5, color: C.faint, textTransform: "uppercase", letterSpacing: 0.6 },
  panel: {
    borderWidth: 0.6,
    borderColor: C.line,
    borderRadius: 5,
    backgroundColor: C.card,
    padding: 10,
    marginBottom: 8,
  },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.5,
    borderBottomWidth: 0.4,
    borderBottomColor: C.line,
  },
  kvKey: { color: C.mute, fontSize: 8.8 },
  kvVal: { color: C.ink, fontSize: 9, fontWeight: "bold" },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3 },
  kpiCard: { width: "25%", padding: 3 },
  kpiInner: {
    borderWidth: 0.6,
    borderRadius: 5,
    padding: 8,
    minHeight: 62,
    backgroundColor: C.white,
  },
  kpiLabel: { fontSize: 7.2, color: C.mute, textTransform: "uppercase", letterSpacing: 0.6 },
  kpiValue: { fontSize: 15, fontWeight: "bold", marginTop: 3 },
  kpiUnit: { fontSize: 8, color: C.mute, marginTop: 1 },
  kpiDesc: { fontSize: 7.2, color: C.faint, marginTop: 2 },
  th: { flexDirection: "row", backgroundColor: C.brand, paddingVertical: 5, paddingHorizontal: 6 },
  thc: { color: C.white, fontSize: 8.5, fontWeight: "bold" },
  td: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.4,
    borderBottomColor: C.line,
  },
  tdc: { fontSize: 8.5, color: C.ink2 },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, color: C.brand, fontSize: 10 },
  bulletTxt: { flex: 1, fontSize: 9, color: C.ink2, lineHeight: 1.45 },
  eqBlock: {
    backgroundColor: C.card,
    padding: 8,
    marginVertical: 4,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
    borderRadius: 3,
  },
  eqTitle: { fontSize: 9.5, fontWeight: "bold", color: C.ink, marginBottom: 2 },
  eq: { fontFamily: "Courier", fontSize: 9, color: C.brandDark, marginVertical: 2 },
  eqNote: { fontSize: 8.5, color: C.mute, lineHeight: 1.4 },
  headerBar: {
    position: "absolute",
    top: 24,
    left: 40,
    right: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 0.6,
    borderBottomColor: C.line,
    paddingBottom: 6,
  },
  headerL: { fontSize: 9, fontWeight: "bold", color: C.brandDark },
  headerR: { fontSize: 7.5, color: C.mute },
  footerBar: {
    position: "absolute",
    bottom: 22,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.6,
    borderTopColor: C.line,
    paddingTop: 6,
  },
  footerL: { fontSize: 7.5, color: C.mute },
  footerR: { fontSize: 7.5, color: C.mute },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    fontSize: 7.5,
    color: C.white,
    fontWeight: "bold",
  },
});

/* ─────────────────────────────  Types & input  ───────────────────────────── */

export interface ReportInput {
  simName: string;
  simId?: string;
  createdAt: string;
  engineer?: string;
  organization?: string;
  vehicle: Record<string, unknown> & {
    name: string;
    manufacturer: string | null;
    category: string;
    mass_kg: number;
    wheelbase_m: number;
    track_m: number;
    cog_height_m: number;
    tire_friction_mu: number;
    fuel_type: string;
  };
  road: Record<string, unknown> & {
    name: string;
    road_type: string;
    length_m: number;
    surface_mu: number;
    base_slope_deg: number;
    curves: unknown;
  };
  summary: SimResults["summary"];
  prediction: ReturnType<typeof predictFromResults>;
  ai: AIExplanation | null;
  samples?: SimSample[];
  segments?: SafeSegmentRow[];
  snapshots?: { scene?: string | null; path?: string | null; elevation?: string | null };
}

export async function generatePdfReport(input: ReportInput): Promise<Blob> {
  return await pdf(<Report {...input} />).toBlob();
}

/* ──────────────────────────────  Helpers  ────────────────────────────────── */

const num = (v: unknown, digits = 2, fallback = "—") => {
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : fallback;
};
const val = (v: unknown, fallback = "—") =>
  v === null || v === undefined || v === "" ? fallback : String(v);

const riskToneColor = (level: string) =>
  level === "critical" ? C.crit : level === "high" ? C.high : level === "moderate" ? C.warn : C.ok;

const scoreTone = (score: number) =>
  score >= 75 ? C.ok : score >= 50 ? C.warn : score >= 25 ? C.high : C.crit;

const reportId = (simId?: string) =>
  `VDR-${(simId ?? Math.random().toString(36).slice(2, 10)).slice(0, 8).toUpperCase()}`;

/* ──────────────────────────────  Chart core  ─────────────────────────────── */

interface Series {
  label: string;
  color: string;
  data: [number, number][];
}
interface ChartOpts {
  width?: number;
  height?: number;
  xLabel: string;
  yLabel: string;
  title: string;
  unit?: string;
}

function LineChart({
  series,
  width = 500,
  height = 180,
  xLabel,
  yLabel,
  title,
  unit,
}: ChartOpts & { series: Series[] }) {
  const padL = 42,
    padR = 12,
    padT = 26,
    padB = 32;
  const w = width,
    h = height;
  const iw = w - padL - padR,
    ih = h - padT - padB;

  const all = series.flatMap((sr) => sr.data);
  if (all.length === 0) return null;
  const minX = Math.min(...all.map((p) => p[0]));
  const maxX = Math.max(...all.map((p) => p[0]));
  const minY = Math.min(0, ...all.map((p) => p[1]));
  const maxY = Math.max(...all.map((p) => p[1]));
  const dx = Math.max(1e-6, maxX - minX),
    dy = Math.max(1e-6, maxY - minY);
  const tx = (x: number) => padL + ((x - minX) / dx) * iw;
  const ty = (y: number) => padT + ih - ((y - minY) / dy) * ih;

  const gridY = 4,
    gridX = 5;
  const yTicks = Array.from({ length: gridY + 1 }, (_, i) => minY + (dy * i) / gridY);
  const xTicks = Array.from({ length: gridX + 1 }, (_, i) => minX + (dx * i) / gridX);

  return (
    <View style={{ marginTop: 4, marginBottom: 8 }}>
      <Text style={{ fontSize: 9.5, fontWeight: "bold", color: C.ink, marginBottom: 3 }}>
        {title}
        {unit ? `  (${unit})` : ""}
      </Text>
      <Svg width={w} height={h}>
        {/* Frame */}
        <Rect
          x={padL}
          y={padT}
          width={iw}
          height={ih}
          fill={C.white}
          stroke={C.line}
          strokeWidth={0.5}
        />
        {/* Y grid + labels */}
        {yTicks.map((yv, i) => (
          <G key={`gy-${i}`}>
            <Line
              x1={padL}
              y1={ty(yv)}
              x2={padL + iw}
              y2={ty(yv)}
              stroke={C.line}
              strokeWidth={0.4}
            />
            <Text
              x={padL - 4}
              y={ty(yv) + 3}
              style={{ fontSize: 6.5, textAnchor: "end", fill: C.mute }}
            >
              {yv.toFixed(dy < 4 ? 2 : dy < 40 ? 1 : 0)}
            </Text>
          </G>
        ))}
        {/* X grid + labels */}
        {xTicks.map((xv, i) => (
          <G key={`gx-${i}`}>
            <Line
              x1={tx(xv)}
              y1={padT}
              x2={tx(xv)}
              y2={padT + ih}
              stroke={C.line}
              strokeWidth={0.4}
            />
            <Text
              x={tx(xv)}
              y={padT + ih + 10}
              style={{ fontSize: 6.5, textAnchor: "middle", fill: C.mute }}
            >
              {xv.toFixed(dx < 4 ? 2 : dx < 40 ? 1 : 0)}
            </Text>
          </G>
        ))}
        {/* Series */}
        {series.map((sr, si) => (
          <Polyline
            key={si}
            points={sr.data.map((p) => `${tx(p[0]).toFixed(1)},${ty(p[1]).toFixed(1)}`).join(" ")}
            stroke={sr.color}
            strokeWidth={1.3}
            fill="none"
          />
        ))}
        {/* Axes labels */}
        <Text
          x={padL + iw / 2}
          y={h - 4}
          style={{ fontSize: 7, textAnchor: "middle", fill: C.ink2 }}
        >
          {xLabel}
        </Text>
        <Text
          x={12}
          y={padT + ih / 2}
          style={{ fontSize: 7, fill: C.ink2 }}
          transform={`rotate(-90 12 ${padT + ih / 2})`}
        >
          {yLabel}
        </Text>
      </Svg>
      {series.length > 1 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 2 }}>
          {series.map((sr, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", marginRight: 12 }}>
              <View
                style={{
                  width: 8,
                  height: 8,
                  backgroundColor: sr.color,
                  marginRight: 4,
                  borderRadius: 2,
                }}
              />
              <Text style={{ fontSize: 7.5, color: C.ink2 }}>{sr.label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ─────────────────────────────  Report body  ─────────────────────────────── */

function Report(input: ReportInput) {
  const {
    summary: sm,
    prediction: p,
    ai,
    vehicle: v,
    road: r,
    samples = [],
    segments = [],
    snapshots,
  } = input;
  const rid = reportId(input.simId);
  const curves =
    (r.curves as Array<{ radius: number; bank_deg?: number; angle_deg?: number }>) ?? [];
  const minRadius = curves.length ? Math.min(...curves.map((c) => c.radius)) : null;
  const maxRadius = curves.length ? Math.max(...curves.map((c) => c.radius)) : null;
  const maxBank = curves.length ? Math.max(...curves.map((c) => c.bank_deg ?? 0)) : 0;
  const ssf = Number(v.track_m) / (2 * Number(v.cog_height_m));
  const brakeDist = Math.pow(sm.top_speed_kmh / 3.6, 2) / (2 * Number(v.tire_friction_mu) * 9.81);
  const powerHp =
    Number((v as { power_hp?: unknown }).power_hp) ||
    Number((v as { max_power_hp?: unknown }).max_power_hp) ||
    null;
  const powerKW = powerHp ? powerHp * 0.7457 : null;
  const p2w = powerKW && Number(v.mass_kg) ? (powerKW * 1000) / Number(v.mass_kg) : null;

  // Downsample samples for charts to keep the PDF small.
  const sub = downsample(samples, 220);
  const speed_d = sub.map<[number, number]>((sp) => [sp.s_m / 1000, sp.speed_mps * 3.6]);
  const speed_t = sub.map<[number, number]>((sp) => [sp.t_s, sp.speed_mps * 3.6]);
  const latG = sub.map<[number, number]>((sp) => [sp.t_s, sp.lat_accel / 9.81]);
  const longG = sub.map<[number, number]>((sp) => [sp.t_s, sp.long_accel / 9.81]);
  const steer = sub.map<[number, number]>((sp) => [sp.t_s, sp.steering_deg]);
  const fuel = sub.map<[number, number]>((sp) => [sp.s_m / 1000, sp.fuel_rate_lps * 3600]);
  const safety = sub.map<[number, number]>((sp) => [sp.t_s, sp.safety_score]);
  const dateStr = new Date(input.createdAt).toLocaleString();

  const kpis: Array<{ k: string; v: string; u: string; d: string; tone?: string }> = [
    { k: "Top Speed", v: sm.top_speed_kmh.toFixed(0), u: "km/h", d: "Max sustained velocity" },
    { k: "Avg Speed", v: sm.avg_speed_kmh.toFixed(0), u: "km/h", d: "Trip average" },
    {
      k: "Peak Lateral",
      v: sm.max_lat_g.toFixed(2),
      u: "g",
      d: "Cornering load",
      tone: sm.max_lat_g > 0.8 ? C.warn : C.ok,
    },
    {
      k: "Safety Score",
      v: `${p.safety_score}`,
      u: "/ 100",
      d: `Risk: ${p.risk_level.toUpperCase()}`,
      tone: scoreTone(p.safety_score),
    },
    { k: "Fuel / 100 km", v: sm.fuel_per_100km.toFixed(2), u: "L eq", d: "Energy consumption" },
    {
      k: "Duration",
      v: sm.total_time_s.toFixed(1),
      u: "s",
      d: `${(sm.total_distance_m / 1000).toFixed(2)} km covered`,
    },
    {
      k: "Skid Prob.",
      v: `${(p.skid_probability * 100).toFixed(0)}`,
      u: "%",
      d: "Lateral grip demand",
      tone: p.skid_probability > 0.4 ? C.crit : p.skid_probability > 0.2 ? C.warn : C.ok,
    },
    {
      k: "Rollover Prob.",
      v: `${(p.rollover_probability * 100).toFixed(0)}`,
      u: "%",
      d: `SSF ${ssf.toFixed(2)}`,
      tone: p.rollover_probability > 0.4 ? C.crit : p.rollover_probability > 0.2 ? C.warn : C.ok,
    },
    {
      k: "Braking Dist.",
      v: brakeDist.toFixed(1),
      u: "m",
      d: `From ${sm.top_speed_kmh.toFixed(0)} km/h`,
    },
    { k: "Max Slope", v: sm.max_slope_deg.toFixed(1), u: "°", d: "Grade encountered" },
    { k: "Max Long. G", v: sm.max_long_g.toFixed(2), u: "g", d: "Accel / brake peak" },
    {
      k: "Min Safety",
      v: sm.min_safety_score.toFixed(0),
      u: "/ 100",
      d: "Worst-case sample",
      tone: scoreTone(sm.min_safety_score),
    },
  ];

  return (
    <Document
      title={`${input.simName} — VirtuDrive AI Report`}
      author={input.engineer ?? "VirtuDrive AI"}
      subject="Virtual Vehicle Performance Simulation Report"
    >
      {/* ─────────  Cover page  ───────── */}
      <Page size="A4" style={s.cover}>
        <View
          style={{
            backgroundColor: C.brandDark,
            paddingTop: 60,
            paddingBottom: 30,
            paddingHorizontal: 44,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Logo />
            <View style={{ marginLeft: 12 }}>
              <Text style={{ color: C.white, fontSize: 20, fontWeight: "bold" }}>
                VirtuDrive AI
              </Text>
              <Text style={{ color: "#a5f3fc", fontSize: 9 }}>
                Virtual Vehicle Performance Testing Platform
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: "flex-end" }}>
              <Text style={[s.chip, { backgroundColor: "#0284c7" }]}>CONFIDENTIAL</Text>
              <Text style={{ color: "#cbd5e1", fontSize: 8, marginTop: 6 }}>Report ID {rid}</Text>
            </View>
          </View>
        </View>

        <View style={{ padding: 44, paddingTop: 30 }}>
          <Text
            style={{
              fontSize: 10,
              color: C.brand,
              textTransform: "uppercase",
              letterSpacing: 2,
              marginBottom: 8,
            }}
          >
            Simulation Report
          </Text>
          <Text style={{ fontSize: 26, fontWeight: "bold", color: C.ink, lineHeight: 1.15 }}>
            {input.simName}
          </Text>
          <Text style={{ fontSize: 11, color: C.mute, marginTop: 6 }}>
            {v.manufacturer ? `${v.manufacturer} ` : ""}
            {v.name} · {r.name}
          </Text>

          <View style={{ height: 1, backgroundColor: C.line, marginVertical: 20 }} />

          <View style={{ flexDirection: "row" }}>
            <View style={{ flex: 1 }}>
              <CoverField k="Vehicle" v={`${v.manufacturer ?? ""} ${v.name}`.trim()} />
              <CoverField k="Category" v={val(v.category)} />
              <CoverField k="Fuel Type" v={val(v.fuel_type)} />
              <CoverField k="Road" v={val(r.name)} />
              <CoverField k="Road Type" v={val(r.road_type)} />
              <CoverField k="Length" v={`${(Number(r.length_m) / 1000).toFixed(2)} km`} />
            </View>
            <View style={{ flex: 1 }}>
              <CoverField k="Simulation ID" v={val(input.simId).slice(0, 8) || "—"} />
              <CoverField k="Generated" v={dateStr} />
              <CoverField k="Engineer" v={val(input.engineer, "VirtuDrive AI Engine")} />
              <CoverField k="Organization" v={val(input.organization, "VirtuDrive AI Labs")} />
              <CoverField k="Report Version" v="v1.0" />
              <CoverField
                k="Status"
                v={p.risk_level.toUpperCase()}
                vColor={riskToneColor(p.risk_level)}
              />
            </View>
          </View>

          <View
            style={{
              marginTop: 24,
              padding: 14,
              backgroundColor: C.card,
              borderRadius: 6,
              borderLeftWidth: 4,
              borderLeftColor: riskToneColor(p.risk_level),
            }}
          >
            <Text
              style={{
                fontSize: 8,
                textTransform: "uppercase",
                letterSpacing: 1,
                color: C.mute,
                marginBottom: 4,
              }}
            >
              Headline Assessment
            </Text>
            <Text style={{ fontSize: 11, color: C.ink, lineHeight: 1.5 }}>
              Overall safety score of{" "}
              <Text style={{ fontWeight: "bold", color: scoreTone(p.safety_score) }}>
                {p.safety_score}/100
              </Text>
              {"  "}with peak lateral load of {sm.max_lat_g.toFixed(2)} g and{" "}
              {sm.top_speed_kmh.toFixed(0)} km/h top speed across{" "}
              {(sm.total_distance_m / 1000).toFixed(2)} km. Risk level:{" "}
              <Text style={{ fontWeight: "bold", color: riskToneColor(p.risk_level) }}>
                {p.risk_level.toUpperCase()}
              </Text>
              .
            </Text>
          </View>

          <View style={{ marginTop: 30 }}>
            <Text style={s.tiny}>Sections</Text>
            <Text style={{ fontSize: 9.5, color: C.ink2, marginTop: 6, lineHeight: 1.7 }}>
              1. Executive Summary · 2. KPI Dashboard · 3. Vehicle Specification · 4. Road Profile
              {"\n"}
              5. Telemetry Charts · 6. Simulation Snapshot · 7. Limiting Curve Events · 8. AI
              Recommendations{"\n"}
              9. Engineering Equations · 10. Technical Appendix
            </Text>
          </View>

          <View
            style={{
              position: "absolute",
              bottom: 30,
              left: 44,
              right: 44,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ fontSize: 8, color: C.faint }}>
              © {new Date().getFullYear()} VirtuDrive AI Labs · All simulation values derived from
              deterministic physics.
            </Text>
            <Text style={{ fontSize: 8, color: C.faint }}>Page 1</Text>
          </View>
        </View>
      </Page>

      {/* ─────────  Page 2 — Executive summary + KPIs  ───────── */}
      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />

        <Text style={s.h2}>1 · Executive Summary</Text>
        <View style={[s.panel, { borderLeftWidth: 3, borderLeftColor: C.brand }]}>
          <Text style={s.body}>
            {ai?.executive_summary ??
              `The ${v.manufacturer ? v.manufacturer + " " : ""}${v.name} completed the ${r.name} route (${(Number(r.length_m) / 1000).toFixed(2)} km, ${val(r.road_type)}) in ${sm.total_time_s.toFixed(1)} s. Peak speed reached ${sm.top_speed_kmh.toFixed(0)} km/h with an average of ${sm.avg_speed_kmh.toFixed(0)} km/h. The vehicle experienced ${sm.max_lat_g.toFixed(2)} g peak lateral load with an overall safety score of ${p.safety_score}/100 (${p.risk_level}).`}
          </Text>
          <View style={{ height: 6 }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
            <Badge
              label={`Risk: ${p.risk_level.toUpperCase()}`}
              color={riskToneColor(p.risk_level)}
            />
            <Badge
              label={`Skid ${(p.skid_probability * 100).toFixed(0)}%`}
              color={p.skid_probability > 0.4 ? C.crit : C.ok}
            />
            <Badge
              label={`Roll ${(p.rollover_probability * 100).toFixed(0)}%`}
              color={p.rollover_probability > 0.4 ? C.crit : C.ok}
            />
            <Badge label={`Fuel ${sm.fuel_per_100km.toFixed(2)} L/100km`} color={C.brand} />
          </View>
        </View>

        <Text style={s.h2}>2 · KPI Dashboard</Text>
        <View style={s.kpiGrid}>
          {kpis.map((k, i) => (
            <View key={i} style={s.kpiCard}>
              <View
                style={[
                  s.kpiInner,
                  {
                    borderColor: k.tone ?? C.line,
                    borderLeftWidth: 3,
                    borderLeftColor: k.tone ?? C.brand,
                  },
                ]}
              >
                <Text style={s.kpiLabel}>{k.k}</Text>
                <Text style={[s.kpiValue, { color: k.tone ?? C.ink }]}>{k.v}</Text>
                <Text style={s.kpiUnit}>{k.u}</Text>
                <Text style={s.kpiDesc}>{k.d}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.h2}>3 · Vehicle Specification</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[s.panel, { flex: 1, marginRight: 4 }]}>
            <Text style={s.h3}>Identity</Text>
            <KV k="Name" v={val(v.name)} />
            <KV k="Manufacturer" v={val(v.manufacturer)} />
            <KV k="Model Year" v={val((v as { year?: unknown }).year)} />
            <KV k="Category" v={val(v.category)} />
            <KV k="Drive Layout" v={val((v as { drive_layout?: unknown }).drive_layout)} />
            <KV
              k="Transmission"
              v={val((v as { transmission_type?: unknown }).transmission_type)}
            />
            <Text style={s.h3}>Dimensions & Mass</Text>
            <KV k="Kerb Mass" v={`${num(v.mass_kg, 0)} kg`} />
            <KV k="Wheelbase" v={`${num(v.wheelbase_m, 3)} m`} />
            <KV k="Track" v={`${num(v.track_m, 3)} m`} />
            <KV k="CoG Height" v={`${num(v.cog_height_m, 3)} m`} />
            <KV k="SSF (t/2h)" v={num(ssf, 2)} />
          </View>
          <View style={[s.panel, { flex: 1, marginLeft: 4 }]}>
            <Text style={s.h3}>Powertrain</Text>
            <KV k="Fuel Type" v={val(v.fuel_type)} />
            <KV k="Engine" v={val((v as { engine_type?: unknown }).engine_type)} />
            <KV
              k="Displacement"
              v={`${val((v as { displacement_cc?: unknown }).displacement_cc)} cc`}
            />
            <KV
              k="Power"
              v={powerHp ? `${powerHp.toFixed(0)} hp (${powerKW?.toFixed(0)} kW)` : "—"}
            />
            <KV k="Torque" v={val((v as { max_torque_nm?: unknown }).max_torque_nm)} />
            <KV k="Power / Mass" v={p2w ? `${p2w.toFixed(1)} W/kg` : "—"} />
            <Text style={s.h3}>Tyres & Aero</Text>
            <KV k="Tyre μ" v={num(v.tire_friction_mu, 2)} />
            <KV k="Tyre Radius" v={val((v as { tire_radius_m?: unknown }).tire_radius_m)} />
            <KV k="Drag Cd" v={val((v as { drag_cd?: unknown }).drag_cd)} />
            <KV
              k="Frontal Area"
              v={`${val((v as { frontal_area_m2?: unknown }).frontal_area_m2)} m²`}
            />
            <KV k="Max Slope Climb" v={`${num(sm.max_climbable_slope_deg, 1)} °`} />
          </View>
        </View>

        <Text style={s.h2}>4 · Road Profile</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[s.panel, { flex: 1, marginRight: 4 }]}>
            <KV k="Road Name" v={val(r.name)} />
            <KV k="Type" v={val(r.road_type)} />
            <KV k="Length" v={`${(Number(r.length_m) / 1000).toFixed(2)} km`} />
            <KV k="Surface μ" v={num(r.surface_mu, 2)} />
            <KV k="Base Slope" v={`${num(r.base_slope_deg, 1)} °`} />
            <KV k="Max Encountered Slope" v={`${num(sm.max_slope_deg, 1)} °`} />
          </View>
          <View style={[s.panel, { flex: 1, marginLeft: 4 }]}>
            <KV k="Curve Count" v={String(curves.length)} />
            <KV k="Min Curve Radius" v={minRadius !== null ? `${minRadius} m` : "—"} />
            <KV k="Max Curve Radius" v={maxRadius !== null ? `${maxRadius} m` : "—"} />
            <KV k="Max Bank Angle" v={`${maxBank.toFixed(1)} °`} />
            <KV k="Weather" v={val((r as { weather?: unknown }).weather, "Clear")} />
            <KV
              k="Ambient Temp"
              v={val((r as { ambient_temp_c?: unknown }).ambient_temp_c, "20 °C")}
            />
          </View>
        </View>
      </Page>

      {/* ─────────  Page 3 — Telemetry charts  ───────── */}
      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />
        <Text style={s.h2}>5 · Telemetry Charts</Text>
        <Text style={s.small}>
          All charts derived directly from station-integrated physics samples ({samples.length}{" "}
          pts).
        </Text>

        <LineChart
          title="Speed vs Distance"
          unit="km/h vs km"
          xLabel="Distance (km)"
          yLabel="Speed (km/h)"
          series={[{ label: "Speed", color: C.brand, data: speed_d }]}
        />

        <LineChart
          title="Speed vs Time"
          unit="km/h vs s"
          xLabel="Time (s)"
          yLabel="Speed (km/h)"
          series={[{ label: "Speed", color: C.accent, data: speed_t }]}
        />

        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <LineChart
              width={245}
              height={150}
              title="Lateral / Longitudinal G"
              xLabel="Time (s)"
              yLabel="g"
              series={[
                { label: "Lateral", color: C.crit, data: latG },
                { label: "Longitudinal", color: C.brand, data: longG },
              ]}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <LineChart
              width={245}
              height={150}
              title="Steering Angle"
              xLabel="Time (s)"
              yLabel="deg"
              series={[{ label: "Steer", color: C.warn, data: steer }]}
            />
          </View>
        </View>

        <View style={{ flexDirection: "row" }}>
          <View style={{ flex: 1, marginRight: 4 }}>
            <LineChart
              width={245}
              height={150}
              title="Fuel Rate vs Distance"
              xLabel="Distance (km)"
              yLabel="L/h eq"
              series={[{ label: "Fuel rate", color: C.high, data: fuel }]}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 4 }}>
            <LineChart
              width={245}
              height={150}
              title="Safety Score Timeline"
              xLabel="Time (s)"
              yLabel="Score"
              series={[{ label: "Safety", color: C.ok, data: safety }]}
            />
          </View>
        </View>
      </Page>

      {/* ─────────  Page 4 — Snapshots + Limiting events  ───────── */}
      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />

        <Text style={s.h2}>6 · Simulation Snapshot</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[s.panel, { flex: 1, marginRight: 4, padding: 6 }]}>
            <Text style={s.tiny}>3D Playback Scene</Text>
            {snapshots?.scene ? (
              <PdfImage
                src={snapshots.scene}
                style={{
                  width: "100%",
                  height: 190,
                  objectFit: "contain",
                  marginTop: 4,
                  borderRadius: 3,
                }}
              />
            ) : (
              <PlaceholderBox label="3D scene not captured" h={190} />
            )}
          </View>
          <View style={[s.panel, { flex: 1, marginLeft: 4, padding: 6 }]}>
            <Text style={s.tiny}>Top-down Path (safety-tinted)</Text>
            {snapshots?.path ? (
              <PdfImage
                src={snapshots.path}
                style={{
                  width: "100%",
                  height: 190,
                  objectFit: "contain",
                  marginTop: 4,
                  borderRadius: 3,
                }}
              />
            ) : (
              <PlaceholderBox label="Path not available" h={190} />
            )}
          </View>
        </View>
        {snapshots?.elevation && (
          <View style={[s.panel, { padding: 6 }]}>
            <Text style={s.tiny}>Elevation Profile</Text>
            <PdfImage
              src={snapshots.elevation}
              style={{ width: "100%", height: 130, objectFit: "contain", marginTop: 4 }}
            />
          </View>
        )}

        <Text style={s.h2}>7 · Limiting Curve Events</Text>
        {sm.limiting_events.length === 0 ? (
          <View style={s.panel}>
            <Text style={s.body}>
              No corner-limited events detected on this road — vehicle operated within grip /
              rollover margins throughout.
            </Text>
          </View>
        ) : (
          <View
            style={{ borderWidth: 0.6, borderColor: C.line, borderRadius: 4, overflow: "hidden" }}
          >
            <View style={s.th}>
              <Text style={[s.thc, { flex: 1 }]}>Station</Text>
              <Text style={[s.thc, { flex: 1 }]}>Radius</Text>
              <Text style={[s.thc, { flex: 1 }]}>Limit</Text>
              <Text style={[s.thc, { flex: 1.2 }]}>Limiting</Text>
              <Text style={[s.thc, { flex: 1 }]}>Steer</Text>
              <Text style={[s.thc, { flex: 1 }]}>Bank</Text>
              <Text style={[s.thc, { flex: 1 }]}>Risk</Text>
            </View>
            {sm.limiting_events.slice(0, 18).map((e, i) => {
              const risk = e.limit_kmh < 40 ? "CRITICAL" : e.limit_kmh < 70 ? "HIGH" : "MODERATE";
              const rc = risk === "CRITICAL" ? C.crit : risk === "HIGH" ? C.high : C.warn;
              return (
                <View key={i} style={[s.td, { backgroundColor: i % 2 ? C.card : C.white }]}>
                  <Text style={[s.tdc, { flex: 1 }]}>{e.station.toFixed(0)} m</Text>
                  <Text style={[s.tdc, { flex: 1 }]}>{e.radius} m</Text>
                  <Text style={[s.tdc, { flex: 1 }]}>{e.limit_kmh.toFixed(0)} km/h</Text>
                  <Text style={[s.tdc, { flex: 1.2 }]}>{e.limiting}</Text>
                  <Text style={[s.tdc, { flex: 1 }]}>{e.steering_deg.toFixed(1)}°</Text>
                  <Text style={[s.tdc, { flex: 1 }]}>{e.bank_deg}°</Text>
                  <Text style={[s.tdc, { flex: 1, color: rc, fontWeight: "bold" }]}>{risk}</Text>
                </View>
              );
            })}
          </View>
        )}
      </Page>

      {/* ─────────  Page 4b — Safe Speed Analysis  ───────── */}
      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />

        <Text style={s.h2}>7b · Safe Speed Analysis (Adaptive Controller)</Text>
        <Text style={s.body}>
          The adaptive controller holds the vehicle at the highest speed that keeps Safety Score =
          100, Skid = 0 %, Rollover = 0 %. For every road segment the table below reports the
          calculated safe speed, the peak the vehicle actually reached, the binding physical
          equation, and the resulting stability margin.
        </Text>

        {segments.length === 0 ? (
          <View style={s.panel}>
            <Text style={s.body}>No segments available.</Text>
          </View>
        ) : (
          <View
            style={{
              borderWidth: 0.6,
              borderColor: C.line,
              borderRadius: 4,
              overflow: "hidden",
              marginTop: 6,
            }}
          >
            <View style={s.th}>
              <Text style={[s.thc, { flex: 1.6 }]}>Segment</Text>
              <Text style={[s.thc, { flex: 0.9 }]}>Radius</Text>
              <Text style={[s.thc, { flex: 0.8 }]}>Bank</Text>
              <Text style={[s.thc, { flex: 0.8 }]}>Grade</Text>
              <Text style={[s.thc, { flex: 0.7 }]}>μ</Text>
              <Text style={[s.thc, { flex: 1 }]}>Safe</Text>
              <Text style={[s.thc, { flex: 1 }]}>Actual</Text>
              <Text style={[s.thc, { flex: 1.4 }]}>Limiting</Text>
              <Text style={[s.thc, { flex: 0.9 }]}>Margin</Text>
            </View>
            {segments.slice(0, 28).map((row, i) => (
              <View key={i} style={[s.td, { backgroundColor: i % 2 ? C.card : C.white }]}>
                <Text style={[s.tdc, { flex: 1.6 }]}>{row.label}</Text>
                <Text style={[s.tdc, { flex: 0.9 }]}>
                  {row.radius_m ? `${row.radius_m.toFixed(0)} m` : "—"}
                </Text>
                <Text style={[s.tdc, { flex: 0.8 }]}>{row.bank_deg.toFixed(1)}°</Text>
                <Text style={[s.tdc, { flex: 0.8 }]}>{row.grade_deg.toFixed(1)}°</Text>
                <Text style={[s.tdc, { flex: 0.7 }]}>{row.surface_mu.toFixed(2)}</Text>
                <Text style={[s.tdc, { flex: 1, color: C.ok, fontWeight: "bold" }]}>
                  {row.safe_kmh.toFixed(0)} km/h
                </Text>
                <Text style={[s.tdc, { flex: 1 }]}>{row.actual_peak_kmh.toFixed(0)} km/h</Text>
                <Text style={[s.tdc, { flex: 1.4 }]}>{LIMIT_LABEL[row.limiting]}</Text>
                <Text
                  style={[
                    s.tdc,
                    { flex: 0.9, color: row.margin_pct >= 3 ? C.ok : C.warn, fontWeight: "bold" },
                  ]}
                >
                  {row.margin_pct.toFixed(1)}%
                </Text>
              </View>
            ))}
          </View>
        )}

        <Text style={s.h3}>Controller Summary</Text>
        <View style={s.panel}>
          <View style={s.kv}>
            <Text style={s.kvKey}>Time held at adaptive safe cap</Text>
            <Text style={s.kvVal}>{((sm.at_limit_fraction ?? 0) * 100).toFixed(1)} %</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.kvKey}>Achieved min safety score</Text>
            <Text style={s.kvVal}>{sm.min_safety_score.toFixed(0)} / 100</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.kvKey}>Skid probability</Text>
            <Text style={s.kvVal}>{(p.skid_probability * 100).toFixed(1)} %</Text>
          </View>
          <View style={s.kv}>
            <Text style={s.kvKey}>Rollover probability</Text>
            <Text style={s.kvVal}>{(p.rollover_probability * 100).toFixed(1)} %</Text>
          </View>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />

        <Text style={s.h2}>8 · AI-Assisted Analysis & Recommendations</Text>

        {ai && (
          <>
            <Text style={s.h3}>Performance Analysis</Text>
            <Text style={s.body}>{ai.performance_analysis}</Text>
            <Text style={s.h3}>Safety Analysis</Text>
            <Text style={s.body}>{ai.safety_analysis}</Text>
            <Text style={s.h3}>Fuel / Energy Analysis</Text>
            <Text style={s.body}>{ai.fuel_analysis}</Text>
          </>
        )}

        <Text style={s.h3}>Identified Key Risks</Text>
        {p.key_risks.length ? (
          p.key_risks.map((k, i) => (
            <View key={i} style={s.bullet}>
              <Text style={s.bulletDot}>•</Text>
              <Text style={s.bulletTxt}>{k}</Text>
            </View>
          ))
        ) : (
          <Text style={s.small}>No significant risks detected.</Text>
        )}

        <Text style={s.h3}>Baseline (Physics) Recommendations</Text>
        {p.recommendations.map((k, i) => (
          <View key={i} style={s.bullet}>
            <Text style={[s.bulletDot, { color: C.accent }]}>›</Text>
            <Text style={s.bulletTxt}>{k}</Text>
          </View>
        ))}

        {ai?.engineering_recommendations && (
          <>
            <Text style={s.h3}>Engineering Recommendations (AI)</Text>
            {ai.engineering_recommendations.map((k, i) => (
              <View key={i} style={s.bullet}>
                <Text style={[s.bulletDot, { color: C.ok }]}>✓</Text>
                <Text style={s.bulletTxt}>{k}</Text>
              </View>
            ))}
          </>
        )}
      </Page>

      {/* ─────────  Page 6 — Equations + Appendix  ───────── */}
      <Page size="A4" style={s.page}>
        <Header rid={rid} name={input.simName} />
        <Footer />

        <Text style={s.h2}>9 · Engineering Equations Applied</Text>

        <Equation
          title="Safe Cornering Speed (with bank & friction)"
          expr="v = √(g · r · (sinθ + μ·cosθ) / (cosθ − μ·sinθ))"
          note="g gravity (9.81 m/s²), r curve radius, θ bank angle, μ tyre–road friction. Determines the maximum speed the vehicle can hold a corner without exceeding tyre grip."
        />
        <Equation
          title="Static Stability Factor & Rollover Threshold"
          expr={`SSF = t / (2·h) = ${ssf.toFixed(2)}    ·    v_roll = √(g · r · SSF)`}
          note="t track width, h CoG height. A higher SSF means the vehicle tolerates more lateral g before rollover. Passenger cars ≈ 1.3–1.6; SUVs ≈ 1.0–1.2."
        />
        <Equation
          title="Aerodynamic Drag & Rolling Resistance"
          expr="F_drag = ½·ρ·Cd·A·v²      F_roll = Crr·m·g·cosθ"
          note={`ρ air density (1.225 kg/m³), Cd drag coefficient (${val((v as { drag_cd?: unknown }).drag_cd)}), A frontal area (${val((v as { frontal_area_m2?: unknown }).frontal_area_m2)} m²). Combined resistance governs top speed and fuel demand.`}
        />
        <Equation
          title="Braking Distance (dry, level)"
          expr={`d = v² / (2·μ·g)  →  d(top) ≈ ${brakeDist.toFixed(1)} m from ${sm.top_speed_kmh.toFixed(0)} km/h`}
          note="Assumes ideal ABS and uniform μ. Real-world distances add driver reaction time and thermal fade."
        />
        <Equation
          title="Fuel Rate Model"
          expr="ṁ_fuel = (P_engine / (η · LHV))"
          note="Engine power divided by drivetrain efficiency η and fuel lower heating value LHV, integrated over the trip to give L/100 km."
        />

        <Text style={s.h2}>10 · Technical Appendix</Text>
        <View style={{ flexDirection: "row" }}>
          <View style={[s.panel, { flex: 1, marginRight: 4 }]}>
            <Text style={s.h3}>Simulation Metadata</Text>
            <KV k="Simulation ID" v={val(input.simId)} />
            <KV k="Report ID" v={rid} />
            <KV k="Physics Engine" v="VirtuDrive Deterministic v1.0" />
            <KV k="Solver" v="Station-integrated speed profile" />
            <KV k="Samples" v={String(samples.length)} />
            <KV k="Duration" v={`${sm.total_time_s.toFixed(2)} s`} />
            <KV k="Distance" v={`${(sm.total_distance_m / 1000).toFixed(3)} km`} />
          </View>
          <View style={[s.panel, { flex: 1, marginLeft: 4 }]}>
            <Text style={s.h3}>Platform</Text>
            <KV k="Software" v="VirtuDrive AI" />
            <KV k="Report Version" v="1.0" />
            <KV k="Generated At" v={dateStr} />
            <KV k="Format" v="A4 Portrait · multi-page" />
            <KV k="Renderer" v="@react-pdf/renderer" />
            <KV k="Charts" v="Vector SVG (selectable)" />
          </View>
        </View>

        <View style={{ marginTop: 10, padding: 10, borderRadius: 4, backgroundColor: C.card }}>
          <Text style={s.small}>
            Disclaimer — This report is generated from a deterministic virtual simulation and is
            intended for engineering analysis, research, education, and demonstration. Real-world
            vehicle behaviour depends on driver skill, environmental conditions, and manufacturing
            tolerances not modelled here. Do not use results as a substitute for physical validation
            testing.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/* ────────────────────────  Small presentational bits  ───────────────────── */

function Header({ rid, name }: { rid: string; name: string }) {
  return (
    <View style={s.headerBar} fixed>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <MiniLogo />
        <Text style={[s.headerL, { marginLeft: 6 }]}>VirtuDrive AI</Text>
        <Text style={[s.headerR, { marginLeft: 10 }]}>· {name}</Text>
      </View>
      <Text style={s.headerR}>{rid}</Text>
    </View>
  );
}

function Footer() {
  return (
    <View style={s.footerBar} fixed>
      <Text style={s.footerL}>
        Generated by VirtuDrive AI · Virtual Vehicle Performance Testing Platform · v1.0
      </Text>
      <Text
        style={s.footerR}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}

function CoverField({ k, v, vColor }: { k: string; v: string; vColor?: string }) {
  return (
    <View style={{ marginBottom: 8 }}>
      <Text
        style={{ fontSize: 7.5, color: C.mute, textTransform: "uppercase", letterSpacing: 0.8 }}
      >
        {k}
      </Text>
      <Text style={{ fontSize: 11, color: vColor ?? C.ink, fontWeight: "bold", marginTop: 2 }}>
        {v}
      </Text>
    </View>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.kv}>
      <Text style={s.kvKey}>{k}</Text>
      <Text style={s.kvVal}>{v}</Text>
    </View>
  );
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <View
      style={{
        backgroundColor: color,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
        marginRight: 4,
        marginTop: 3,
      }}
    >
      <Text style={{ fontSize: 7.5, color: C.white, fontWeight: "bold" }}>{label}</Text>
    </View>
  );
}

function PlaceholderBox({ label, h }: { label: string; h: number }) {
  return (
    <View
      style={{
        height: h,
        borderWidth: 0.6,
        borderColor: C.line,
        borderRadius: 3,
        alignItems: "center",
        justifyContent: "center",
        marginTop: 4,
      }}
    >
      <Text style={{ fontSize: 8.5, color: C.faint }}>{label}</Text>
    </View>
  );
}

function Equation({ title, expr, note }: { title: string; expr: string; note: string }) {
  return (
    <View style={s.eqBlock} wrap={false}>
      <Text style={s.eqTitle}>{title}</Text>
      <Text style={s.eq}>{expr}</Text>
      <Text style={s.eqNote}>{note}</Text>
    </View>
  );
}

function Logo() {
  return (
    <Svg width={44} height={44} viewBox="0 0 44 44">
      <Rect x={0} y={0} width={44} height={44} rx={9} fill="#0e7490" />
      <Path d="M8 30 L18 12 L26 30 Z" fill="#a5f3fc" />
      <Path d="M20 30 L30 12 L38 30 Z" fill="#67e8f9" />
      <Line x1={8} y1={34} x2={38} y2={34} stroke="#ffffff" strokeWidth={1.5} />
    </Svg>
  );
}
function MiniLogo() {
  return (
    <Svg width={14} height={14} viewBox="0 0 44 44">
      <Rect x={0} y={0} width={44} height={44} rx={9} fill="#0e7490" />
      <Path d="M8 30 L18 12 L26 30 Z" fill="#a5f3fc" />
      <Path d="M20 30 L30 12 L38 30 Z" fill="#67e8f9" />
    </Svg>
  );
}

/* ─────────────────────────────  Utilities  ───────────────────────────────── */

function downsample<T>(arr: T[], maxPts: number): T[] {
  if (arr.length <= maxPts) return arr;
  const step = arr.length / maxPts;
  const out: T[] = [];
  for (let i = 0; i < maxPts; i++) out.push(arr[Math.floor(i * step)]);
  out.push(arr[arr.length - 1]);
  return out;
}
