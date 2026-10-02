import { MATTER_QUERY } from "../config";
import { fetchResource } from "./api";

type Row = Record<string, unknown>;

/** Everything Clio holds about one matter, raw. */
export interface MatterBundle {
  matter: Row;
  notes: Row[];
  communications: Row[];
  tasks: Row[];
  calendar_entries: Row[];
  documents: Row[];
  activities: Row[];
  relationships: Row[];
  client: Row | null;
  warnings: string[];
}

const MATTER_FIELDS =
  "id,etag,display_number,description,status,open_date,close_date,created_at,updated_at," +
  "practice_area{name},client{id,name,type},responsible_attorney{name}," +
  "custom_field_values{id,field_name,value}";
const MATTER_FIELDS_MIN = "id,display_number,description,status,open_date,created_at,updated_at,client{id,name}";

const RESOURCES: [keyof Omit<MatterBundle, "matter" | "client" | "warnings">, string, Record<string, string>, string, string][] = [
  ["notes", "notes.json", { type: "Matter" },
    "id,etag,subject,detail,date,created_at,updated_at,author{name}", "id,subject,detail,date,created_at,updated_at"],
  ["communications", "communications.json", {},
    "id,etag,subject,body,date,type,created_at,updated_at,senders{name},receivers{name}", "id,subject,body,date,type,created_at,updated_at"],
  ["tasks", "tasks.json", {},
    "id,etag,name,description,status,priority,due_at,completed_at,created_at,updated_at,assignee{name}", "id,name,description,status,due_at,created_at,updated_at"],
  ["calendar_entries", "calendar_entries.json", {},
    "id,etag,summary,description,start_at,end_at,all_day,location,created_at,updated_at", "id,summary,description,start_at,end_at,created_at,updated_at"],
  ["documents", "documents.json", {},
    "id,etag,name,content_type,size,created_at,updated_at,parent{name},document_category{name}", "id,name,content_type,size,created_at,updated_at"],
  ["activities", "activities.json", {},
    "id,etag,type,date,quantity,price,total,note,created_at,updated_at,user{name}", "id,type,date,total,note,created_at,updated_at"],
  ["relationships", "relationships.json", {},
    "id,description,contact{id,name,type,primary_email_address,primary_phone_number}", "id,description,contact{id,name}"],
];

export async function fetchMatterBundle(query = MATTER_QUERY): Promise<MatterBundle> {
  const warnings: string[] = [];
  const matches = await fetchResource("matters", "matters.json", { query }, MATTER_FIELDS, MATTER_FIELDS_MIN, warnings);
  if (!matches.length) {
    throw new Error(`No matter matching "${query}" in Clio. Check that the Swans setup app finished loading it.`);
  }
  const matter = matches[0];
  const matterId = Number(matter.id);

  const out: Partial<MatterBundle> = { matter, warnings };
  // Sequential on purpose: gentle on Clio's rate limit.
  for (const [name, path, extra, fields, fallback] of RESOURCES) {
    out[name] = await fetchResource(name, path, { ...extra, matter_id: matterId }, fields, fallback, warnings);
  }

  let client: Row | null = null;
  const clientRef = matter.client as { id?: number } | undefined;
  if (clientRef?.id) {
    const rows = await fetchResource(
      "client",
      `contacts/${clientRef.id}.json`,
      {},
      "id,name,first_name,last_name,type,date_of_birth,primary_email_address,primary_phone_number,custom_field_values{id,field_name,value}",
      "id,name,type",
      warnings,
    ).catch(() => []);
    client = rows[0] ?? null;
  }
  return { ...(out as MatterBundle), client };
}
