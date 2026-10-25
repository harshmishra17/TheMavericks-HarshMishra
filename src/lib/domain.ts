import { z } from "zod";
export const itemSchema = z.object({
  id: z.string().min(1).max(80),
  description: z.string().min(1).max(200),
  kind: z.enum(["visit", "labour", "material"]),
  amount: z.number().int().min(0).max(10000000),
  estimated: z.boolean().default(false),
});
export const termsSchema = z
  .object({
    mode: z.enum(["inspection", "repair"]),
    scope: z.string().min(5).max(4000),
    exclusions: z.string().max(2000),
    assumptions: z.string().max(2000),
    window: z.string().min(3).max(200),
    items: z.array(itemSchema).min(1).max(20),
    credit: z.number().int().min(0).default(0),
  })
  .refine((t) => t.credit <= t.items.reduce((n, i) => n + i.amount, 0), {
    message: "Credit exceeds the item total",
  })
  .refine((t) => new Set(t.items.map((i) => i.id)).size === t.items.length, {
    message: "Duplicate item identifiers",
  });
export type Terms = z.infer<typeof termsSchema>;
export const money = (paise: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(paise / 100);
export const total = (t: Terms) =>
  termsSchema.parse(t).items.reduce((n, i) => n + i.amount, 0) - t.credit;
export function actualTotal(approved: Terms, actual: Terms) {
  if (
    approved.mode !== actual.mode ||
    approved.credit !== actual.credit ||
    approved.items.length !== actual.items.length
  )
    throw new Error("Actual items must match the agreement");
  for (const i of actual.items) {
    const cap = approved.items.find((c) => c.id === i.id);
    if (
      !cap ||
      i.amount > cap.amount ||
      i.kind !== cap.kind ||
      i.description !== cap.description
    )
      throw new Error("Item exceeds or changes its approved cap");
  }
  return total(actual);
}
export const questions = [
  [
    "room",
    "Which room and fitting?",
    [
      "Kitchen sink tap",
      "Bathroom basin tap",
      "Shower fitting",
      "I don’t know",
    ],
  ],
  [
    "source",
    "Where is the leak?",
    ["Outlet", "Base", "Supply pipe", "I don’t know"],
  ],
  [
    "frequency",
    "When does it leak?",
    ["Continuously", "Only during use", "I don’t know"],
  ],
  [
    "access",
    "Can the fitting be accessed safely?",
    ["Yes", "No", "I don’t know"],
  ],
  ["valve", "Is a shutoff valve visible?", ["Yes", "No", "I don’t know"]],
  [
    "intent",
    "What would you like quoted?",
    ["Inspection first", "Repair as described"],
  ],
] as const;
export function buildBrief(
  description: string,
  answers: Record<string, string>,
) {
  return `${description.trim()}\n\nFitting: ${answers.room || "Unknown"}. Leak location: ${answers.source || "Unknown"}. Frequency: ${answers.frequency || "Unknown"}. Safely accessible: ${answers.access || "Unknown"}. Shutoff valve visible: ${answers.valve || "Unknown"}. Requested service: ${answers.intent || "Inspection first"}. Preferred visit: ${answers.window || "To agree"}.\n\nCause is unknown. Requested outcome: inspect and, if the agreed repair is suitable, stop the leak. Whole-tap replacement and hidden pipework are excluded unless separately approved.`;
}
export const defaultTerms: Terms = {
  mode: "repair",
  scope: "Inspect the leaking tap and repair the described leak.",
  exclusions: "Whole-tap replacement and hidden pipework.",
  assumptions: "Accessible fitting; water isolation available.",
  window: "Tomorrow, 10 am–12 pm",
  items: [
    {
      id: "visit",
      description: "Visit and inspection",
      kind: "visit",
      amount: 10000,
      estimated: false,
    },
    {
      id: "labour",
      description: "Tap repair labour",
      kind: "labour",
      amount: 25000,
      estimated: false,
    },
    {
      id: "materials",
      description: "Washer / seal allowance",
      kind: "material",
      amount: 10000,
      estimated: true,
    },
  ],
  credit: 0,
};
export type Row = Record<string, any>; // JSON snapshots from the versioned database boundary.
