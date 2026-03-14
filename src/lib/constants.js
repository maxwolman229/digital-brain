export const DOMAIN = {
  name: "Steel",
  categories: ["Material", "Process", "Equipment", "People", "Measurement", "Environment", "Process / Material", "Material / Process"],
  statuses: ["Proposed", "Active", "Verified", "Established", "Stale", "Contradicted", "Retired"],
  confidences: ["Low", "Medium", "High", "Very High"],
  processAreas: ["EAF", "Casting", "Rolling", "Ladle Furnace", "Scrap Yard", "Quality Lab", "Other"],
  processAreaColors: { EAF: "#F2652F", Casting: "#062044", Rolling: "#4FA89A", "Ladle Furnace": "#F2652F", "Scrap Yard": "#8a8278", "Quality Lab": "#4FA89A", Other: "#999" },
  contextPrompt: `You are an expert steelmaking knowledge engineer. You understand EAF steelmaking, continuous casting, ladle metallurgy, scrap management, and downstream rolling/finishing. The Ishikawa categories are: Material, Process, Equipment, People, Measurement, Environment. Process areas include: EAF, Casting, Rolling, Ladle Furnace, Scrap Yard, Quality Lab.`,
};

export const CATEGORIES = DOMAIN.categories;
export const STATUSES = DOMAIN.statuses;
export const CONFIDENCES = DOMAIN.confidences;
export const PROCESS_AREAS = DOMAIN.processAreas;
export const ISHIKAWA_CATS = ["Material", "Process", "Equipment", "People", "Measurement", "Environment"];
export const IMPACTS = ["Minor", "Moderate", "Significant", "Major"];
export const EVENT_STATUSES = ["Open", "Investigating", "Closed"];
export const EVENT_OUTCOMES = ["Positive", "Negative"];

export const FNT = "'IBM Plex Sans', 'Helvetica Neue', Arial, sans-serif";
export const FNTM = "'IBM Plex Mono', 'Courier New', monospace";

export const iS = {
  width: "100%",
  padding: "8px 12px",
  background: "#f8f6f4",
  border: "1px solid #D8CEC3",
  borderRadius: 3,
  color: "#1F1F1F",
  fontSize: 13,
  fontFamily: FNT,
  outline: "none",
  boxSizing: "border-box",
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const confidenceColor = (c) =>
  ({ Low: { bg: "#fde8e5", text: "#c0392b" }, Medium: { bg: "#fef3e2", text: "#e67e22" }, High: { bg: "#e6f5f1", text: "#4FA89A" }, "Very High": { bg: "#e8edf4", text: "#062044" } }[c] || { bg: "#f0eeec", text: "#888" });

export const statusColor = (s) =>
  ({ Proposed: { bg: "#fef3e2", text: "#F2652F" }, Active: { bg: "#d4edda", text: "#28a745" }, Verified: { bg: "#a8d8b9", text: "#1e7e34" }, Established: { bg: "#155724", text: "#FFFFFF" }, Stale: { bg: "#fef3e2", text: "#F2652F" }, Contradicted: { bg: "#fde8e5", text: "#c0392b" }, Retired: { bg: "#f0eeec", text: "#999" } }[s] || { bg: "#f0eeec", text: "#999" });

export const paColor = (p) => (DOMAIN.processAreaColors[p] || "#999");

export const impactColor = (s) =>
  ({ Minor: { bg: "#f0eeec", text: "#999" }, Moderate: { bg: "#fef3e2", text: "#F2652F" }, Significant: { bg: "#fde8e5", text: "#c0392b" }, Major: { bg: "#f9d6d0", text: "#a01010" } }[s] || { bg: "#f0eeec", text: "#999" });

export const eventStatusColor = (s) =>
  ({ Open: { bg: "#fef3e2", text: "#F2652F" }, Investigating: { bg: "#f0eeec", text: "#888" }, Closed: { bg: "#e6f5f1", text: "#4FA89A" } }[s] || { bg: "#f0eeec", text: "#999" });

export const outcomeColor = (o) =>
  ({ Positive: { bg: "#e6f5f1", text: "#4FA89A" }, Negative: { bg: "#fde8e5", text: "#c0392b" } }[o] || { bg: "#f0eeec", text: "#999" });
