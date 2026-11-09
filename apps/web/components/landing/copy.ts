export const DEMO_HREF = "/trade?model=glm-5.3-flash";

export const CARDS = [
  { card: 589, label: 613, body: 613, sphere: 631, sphereTop: 1052, title: "01/ sell what expires", bodyText: "Provider credits reset or expire. Sellers list what they won't use, always under list price, by rule.", art: { src: "/images/1st.svg", w: 252, h: 248 } },
  { card: 947, label: 970, body: 972, sphere: 987, sphereTop: 1052, title: "02/ agents pay", bodyText: "No account, no card. An agent with a router key buys inference; the router pulls USDC from its owner's wallet on NEAR.", art: { src: "/images/2nd.svg", w: 257, h: 247 } },
  { card: 1305, label: 1324, body: 1324, sphere: 1349, sphereTop: 1078, title: "03/ one limit", bodyText: "A NEAR wallet owns the money and sets a daily limit per agent. The contract enforces it, and the agent never holds a key.", art: { src: "/images/3rd.svg", w: 249, h: 210 } },
];

export const COLUMN_COPY = [
  { x: 171, head: "Every fill names its rail", bodyText: "NEAR AI runs the verifiable rail, with TEE signatures in the receipts." },
  { x: 461, head: "Every payment is public", bodyText: "Top-ups, pulls and payouts are USDC transfers on NEAR with explorer links." },
  { x: 757, head: "Supply stays capped", bodyText: "One owner, one wallet, a daily limit per agent the contract cannot exceed." },
  { x: 1047, head: "The index recomputes", bodyText: "Per-minute public rollups; rebuild them on /receipts yourself." },
  { x: 1344, head: "The curve is settled", bodyText: "Perps clear against the house vault at 5x, funding on skew." },
];

export const LINE = "bg-[#CECECE]";
