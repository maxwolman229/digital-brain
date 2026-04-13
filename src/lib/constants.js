export const STATUSES = ["Proposed", "Active", "Verified", "Established", "Reference", "Stale", "Contradicted", "Pending Archive", "Retired"];
export const ISHIKAWA_CATS = ["Material", "Process", "Equipment", "People", "Measurement", "Environment"];
export const IMPACTS = ["Minor", "Moderate", "Significant", "Major"];
export const EVENT_STATUSES = ["Open", "Investigating", "Closed"];
export const EVENT_OUTCOMES = ["Positive", "Negative"];

export const FNT = "var(--md1-font-sans)";
export const FNTM = "var(--md1-font-mono)";

export const iS = {
  width: "100%",
  padding: "8px 12px",
  background: "var(--md1-input-bg)",
  border: "1px solid var(--md1-border)",
  borderRadius: 3,
  color: "var(--md1-text)",
  fontSize: 13,
  fontFamily: FNT,
  outline: "none",
  boxSizing: "border-box",
};

export const formatDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

export const statusColor = (s) =>
  ({ Proposed: { bg: "#fef3e2", text: "#F2652F" }, Active: { bg: "#d4edda", text: "#28a745" }, Verified: { bg: "#a8d8b9", text: "#1e7e34" }, Established: { bg: "#155724", text: "#FFFFFF" }, Reference: { bg: "#e8edf4", text: "#4a6785" }, Stale: { bg: "#fef3e2", text: "#F2652F" }, Contradicted: { bg: "#fde8e5", text: "#c0392b" }, "Pending Archive": { bg: "#f0eeec", text: "var(--md1-muted)" }, Retired: { bg: "#f0eeec", text: "#999" } }[s] || { bg: "#f0eeec", text: "#999" });

// Consistent color for any process area string via hash → palette
const PA_PALETTE = ['#F2652F', 'var(--md1-primary)', 'var(--md1-accent)', 'var(--md1-muted)', '#c0392b', '#16a085', '#4466AA', '#e67e22']
export const paColor = (p) => {
  if (!p) return '#999'
  let h = 0
  for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0
  return PA_PALETTE[h % PA_PALETTE.length]
}

export const impactColor = (s) =>
  ({ Minor: { bg: "#f0eeec", text: "#999" }, Moderate: { bg: "#fef3e2", text: "#F2652F" }, Significant: { bg: "#fde8e5", text: "#c0392b" }, Major: { bg: "#f9d6d0", text: "#a01010" } }[s] || { bg: "#f0eeec", text: "#999" });

export const eventStatusColor = (s) =>
  ({ Open: { bg: "#fef3e2", text: "#F2652F" }, Investigating: { bg: "#f0eeec", text: "#888" }, Closed: { bg: "#e6f5f1", text: "var(--md1-accent)" } }[s] || { bg: "#f0eeec", text: "#999" });

export const outcomeColor = (o) =>
  ({ Positive: { bg: "#e6f5f1", text: "var(--md1-accent)" }, Negative: { bg: "#fde8e5", text: "#c0392b" } }[o] || { bg: "#f0eeec", text: "#999" });
