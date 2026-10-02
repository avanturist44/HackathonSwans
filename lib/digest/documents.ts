import { PDFDocument } from "pdf-lib";
import { MAX_DOC_BYTES, MODEL_TRIAGE } from "../config";
import { downloadDocument } from "../clio/api";
import { callStructured, type ContentBlock, type Usage } from "../llm";
import { readJson, writeJson } from "../store";
import type { BodyRegion, Entry } from "../types";

/** What we learn from reading one document (cached per document version). */
export interface DocExtraction {
  docType: string;
  summary: string;
  provider: string | null;
  dateOfService: string | null;
  diagnoses: { name: string; bodyRegion: BodyRegion; page: number | null }[];
  amounts: { label: string; amount: number; page: number | null }[];
  keyFacts: { fact: string; page: number | null }[];
  pages: number | null;
  error?: string;
}

const CACHE = "doc-cache.json";
const PAGES_PER_CHUNK = 30;

const BODY_REGIONS: BodyRegion[] = [
  "head", "neck", "left_shoulder", "right_shoulder", "upper_back", "lower_back", "chest", "abdomen",
  "left_arm", "right_arm", "left_hand", "right_hand", "hip", "left_knee", "right_knee", "left_leg", "right_leg", "other",
];

const SCHEMA = {
  type: "object",
  properties: {
    doc_type: {
      type: "string",
      enum: ["medical_record", "imaging_report", "bill", "police_report", "insurance_correspondence",
        "correspondence", "legal_filing", "intake", "photo", "other"],
    },
    summary: { type: "string", description: "2-3 plain sentences: what this document is and what it establishes for the case." },
    provider: { type: ["string", "null"], description: "Medical provider or facility that authored it, if any." },
    date_of_service: { type: ["string", "null"], description: "YYYY-MM-DD of the visit/event the document records, if any." },
    diagnoses: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          body_region: { type: "string", enum: BODY_REGIONS },
          page: { type: ["integer", "null"] },
        },
        required: ["name", "body_region", "page"],
      },
    },
    amounts: {
      type: "array",
      description: "Billed/paid/policy amounts stated in the document.",
      items: {
        type: "object",
        properties: { label: { type: "string" }, amount: { type: "number" }, page: { type: ["integer", "null"] } },
        required: ["label", "amount", "page"],
      },
    },
    key_facts: {
      type: "array",
      description: "Up to 8 facts that matter for a personal-injury case: fault, injuries, treatment, bills, insurance, deadlines.",
      items: {
        type: "object",
        properties: { fact: { type: "string" }, page: { type: ["integer", "null"] } },
        required: ["fact", "page"],
      },
    },
  },
  required: ["doc_type", "summary", "provider", "date_of_service", "diagnoses", "amounts", "key_facts"],
};

interface RawExtraction {
  doc_type: string;
  summary: string;
  provider: string | null;
  date_of_service: string | null;
  diagnoses: { name: string; body_region: BodyRegion; page: number | null }[];
  amounts: { label: string; amount: number; page: number | null }[];
  key_facts: { fact: string; page: number | null }[];
}

const SYSTEM =
  "You read documents from a personal-injury case file for the attorney. Extract only what the document actually says. " +
  "Never guess. Page numbers refer to the page of the PDF given to you, plus the stated page offset. " +
  "Scanned pages are images: read them.";

function kindOf(contentType: string, name: string): "pdf" | "image" | "text" | null {
  const ct = contentType.toLowerCase();
  const n = name.toLowerCase();
  if (ct.includes("pdf") || n.endsWith(".pdf")) return "pdf";
  if (/image\/(jpeg|png|gif|webp)/.test(ct) || /\.(jpe?g|png|gif|webp)$/.test(n)) return "image";
  if (ct.startsWith("text/") || ct.includes("json") || /\.(txt|md|csv|html?|eml|json|rtf)$/.test(n)) return "text";
  return null;
}

async function extractBlocks(blocks: ContentBlock[], title: string, pageOffset: number, usage: Usage): Promise<RawExtraction> {
  return callStructured<RawExtraction>({
    model: MODEL_TRIAGE,
    system: SYSTEM,
    content: [
      ...blocks,
      { type: "text", text: `Document title: ${title}\nPage offset: ${pageOffset} (the first page here is page ${pageOffset + 1}).\nExtract it.` },
    ],
    toolName: "record_document",
    toolDescription: "Record what this case document establishes.",
    schema: SCHEMA,
    maxTokens: 3000,
    usage,
  });
}

function imageMedia(contentType: string, name: string): "image/jpeg" | "image/png" | "image/gif" | "image/webp" {
  const t = `${contentType} ${name}`.toLowerCase();
  if (t.includes("png")) return "image/png";
  if (t.includes("gif")) return "image/gif";
  if (t.includes("webp")) return "image/webp";
  return "image/jpeg";
}

async function readOne(entry: Entry, usage: Usage): Promise<DocExtraction> {
  const empty: DocExtraction = {
    docType: "other", summary: "", provider: null, dateOfService: null, diagnoses: [], amounts: [], keyFacts: [], pages: null,
  };
  const { bytes, contentType } = await downloadDocument(entry.clioId);
  if (bytes.length > MAX_DOC_BYTES * 4) return { ...empty, error: "file too large to read" };
  const kind = kindOf(contentType, entry.title);
  if (!kind) return { ...empty, error: `unsupported file type (${contentType})` };

  const parts: { raw: RawExtraction; offset: number }[] = [];
  let pages: number | null = null;

  if (kind === "pdf") {
    let pdf: PDFDocument | null = null;
    try {
      pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pages = pdf.getPageCount();
    } catch {
      pdf = null;
    }
    if (pdf && pages && pages > PAGES_PER_CHUNK) {
      for (let start = 0; start < pages; start += PAGES_PER_CHUNK) {
        const chunk = await PDFDocument.create();
        const idx = Array.from({ length: Math.min(PAGES_PER_CHUNK, pages - start) }, (_, i) => start + i);
        (await chunk.copyPages(pdf, idx)).forEach((p) => chunk.addPage(p));
        const data = Buffer.from(await chunk.save()).toString("base64");
        parts.push({
          raw: await extractBlocks(
            [{ type: "document", source: { type: "base64", media_type: "application/pdf", data } }],
            entry.title, start, usage),
          offset: start,
        });
      }
    } else {
      if (bytes.length > MAX_DOC_BYTES) return { ...empty, pages, error: "file too large to read" };
      parts.push({
        raw: await extractBlocks(
          [{ type: "document", source: { type: "base64", media_type: "application/pdf", data: bytes.toString("base64") } }],
          entry.title, 0, usage),
        offset: 0,
      });
    }
  } else if (kind === "image") {
    if (bytes.length > 5 * 1024 * 1024) return { ...empty, error: "image too large to read" };
    parts.push({
      raw: await extractBlocks(
        [{ type: "image", source: { type: "base64", media_type: imageMedia(contentType, entry.title), data: bytes.toString("base64") } }],
        entry.title, 0, usage),
      offset: 0,
    });
  } else {
    const text = bytes.toString("utf8").slice(0, 120_000);
    parts.push({ raw: await extractBlocks([{ type: "text", text }], entry.title, 0, usage), offset: 0 });
  }

  const first = parts[0].raw;
  return {
    docType: first.doc_type,
    summary: parts.map((p) => p.raw.summary).filter(Boolean).join(" ").slice(0, 1200),
    provider: parts.map((p) => p.raw.provider).find(Boolean) ?? null,
    dateOfService: parts.map((p) => p.raw.date_of_service).find(Boolean) ?? null,
    diagnoses: parts.flatMap((p) => p.raw.diagnoses.map((d) => ({ name: d.name, bodyRegion: d.body_region, page: d.page }))),
    amounts: parts.flatMap((p) => p.raw.amounts),
    keyFacts: parts.flatMap((p) => p.raw.key_facts).slice(0, 16),
    pages,
  };
}

/**
 * Read every document once per version. Cached by `<id>@<updatedAt>`, so opening
 * the case again never re-reads unchanged files.
 */
export async function readDocuments(
  docs: Entry[],
  usage: Usage,
  onProgress: (done: number, total: number) => void,
): Promise<Record<string, DocExtraction>> {
  const cache = await readJson<Record<string, DocExtraction>>(CACHE, {});
  const result: Record<string, DocExtraction> = {};
  const todo = docs.filter((d) => {
    const hit = cache[`${d.id}@${d.updatedAt}`];
    if (hit && !hit.error) result[d.id] = hit;
    return !(hit && !hit.error);
  });
  let done = docs.length - todo.length;
  onProgress(done, docs.length);

  const queue = [...todo];
  // Two at a time: new API keys have low per-minute token limits and scans are large.
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length) {
      const doc = queue.shift()!;
      try {
        result[doc.id] = await readOne(doc, usage);
      } catch (err) {
        result[doc.id] = {
          docType: "other", summary: "", provider: null, dateOfService: null, diagnoses: [], amounts: [], keyFacts: [], pages: null,
          error: (err as Error).message.slice(0, 200),
        };
      }
      cache[`${doc.id}@${doc.updatedAt}`] = result[doc.id];
      await writeJson(CACHE, cache);
      onProgress(++done, docs.length);
    }
  });
  await Promise.all(workers);
  return result;
}

/** Fold what we read back into the document entries so triage and the brief can use it. */
export function enrichDocEntries(entries: Entry[], docs: Record<string, DocExtraction>): void {
  for (const e of entries) {
    const x = docs[e.id];
    if (!x || x.error) continue;
    const facts = x.keyFacts.map((f) => `- ${f.fact}${f.page ? ` (p.${f.page})` : ""}`).join("\n");
    const dx = x.diagnoses.map((d) => `- ${d.name}${d.page ? ` (p.${d.page})` : ""}`).join("\n");
    e.text = [
      `Type: ${x.docType.replace(/_/g, " ")}${x.pages ? ` · ${x.pages} pages` : ""}`,
      x.provider && `Provider: ${x.provider}`,
      x.dateOfService && `Date of service: ${x.dateOfService}`,
      x.summary,
      dx && `Diagnoses:\n${dx}`,
      facts && `Key facts:\n${facts}`,
      e.text,
    ].filter(Boolean).join("\n\n");
    if (x.dateOfService) e.date = x.dateOfService;
  }
}
