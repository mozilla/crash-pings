import { gzipSync } from "node:zlib";
import { emptyPings, pingFields, DATA_VERSION } from "app/data/format.ts";
import type { IStringPingField, PingFields, TypeMap, Pings, StringIndex } from "app/data/format.ts";
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

const EMPTY_RETRY_MS = 1000 * 60 * 15; // 15 minutes, as milliseconds

type Ping = {
	[K in keyof PingFields]: TypeMap<string>[PingFields[K]];
};

type StringLookup = Map<string, number>;

function condenseData(data: Ping[]): Pings {
	const fieldStringLookup = new Map<IStringPingField, StringLookup>();
	const output: Pings = emptyPings(() => { return { strings: [], values: [] } });

	function getstr(field: IStringPingField, s: string | null): StringIndex {
		if (s === null) return 0;

		if (!fieldStringLookup.has(field)) {
			fieldStringLookup.set(field, new Map<string, number>());
		}
		const stringLookup = fieldStringLookup.get(field)!;

		if (!stringLookup.has(s)) {
			output[field].strings.push(s);
			stringLookup.set(s, output[field].strings.length);
		}
		return stringLookup.get(s)!;
	}

	for (const ping of data) {
		for (const [k, type] of pingFields()) {
			const inValue = ping[k];
			if (type === "istring") {
				const kfield = k as IStringPingField;
				output[kfield].values.push(getstr(kfield, inValue as string));
			} else {
				(output[k] as any[]).push(inValue);
			}
		}
	}

	return output;
}

const REDASH_URL: string = "https://sql.telemetry.mozilla.org";
const REDASH_QUERY_ID: number = 106182;

enum RedashJobStatus {
	Pending = 1,
	Started = 2,
	Success = 3,
	Failure = 4,
	Cancelled = 5,
}

type RedashId = string | number;

type RedashApiResult<T> = {
	job: {
		status: RedashJobStatus,
		id: RedashId
		query_result_id?: RedashId,
		error?: string
	}
} | {
	query_result: {
		data: {
			rows: T[]
		}
	}
};

async function fetchRedash(method: "POST", apiEndpoint: string, parameters: { date: string }): Promise<RedashApiResult<Ping>>;
async function fetchRedash(method: "GET", apiEndpoint: string): Promise<RedashApiResult<Ping>>;
async function fetchRedash(method: string, apiEndpoint: string, parameters?: { date: string }): Promise<RedashApiResult<Ping>> {
	const request: RequestInit = {
		method,
		headers: {
			"Authorization": `Key ${process.env["REDASH_API_KEY"]}`
		},
	};
	if (method === "POST") {
		request.body = JSON.stringify({ parameters });
	}
	const response = await fetch(`${REDASH_URL}/api/${apiEndpoint}`, request);
	if (response.status >= 400) {
		throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
	}
	return await response.json();
}

async function fetchData(date: string): Promise<Ping[]> {
	let result = await fetchRedash("POST", `queries/${REDASH_QUERY_ID}/results`, { date });
	while (true) {
		if ("query_result" in result) {
			return result.query_result.data.rows;
		}
		else {
			switch (result.job.status) {
				case RedashJobStatus.Pending:
				case RedashJobStatus.Started:
					// Wait and poll
					await new Promise(resolve => setTimeout(resolve, 1000));
					result = await fetchRedash("GET", `jobs/${result.job.id}`);
					break;
				case RedashJobStatus.Success:
					if (result.job.query_result_id === undefined) {
						throw new Error("successful job missing query result id");
					}
					result = await fetchRedash("GET", `queries/${REDASH_QUERY_ID}/results/${result.job.query_result_id}.json`);
					break;
				case RedashJobStatus.Failure:
					throw new Error(`job failed: ${result.job.error ?? "unknown"}`);
					break;
				case RedashJobStatus.Cancelled:
					throw new Error("job cancelled");
					break;
			}
		}
	}
}

const LOCAL_PSK = process.env["NETLIFY_LOCAL_PSK"];

export default async (req: Request, _context: Context) => {
	// Only allow 'local' requests from our own functions.
	if (!LOCAL_PSK || req.headers.get("Authorization") !== `PSK ${LOCAL_PSK}`) {
		throw new Error("Unauthorized");
	}

	const { date } = await req.json() as { date: string };

	const currentDate = new Date();

	const requestStore = getStore("ping-data-request");
	// Set a marker as a best-effort to prevent multiple concurrent (and
	// unnecessary) background functions for a particular date.
	await requestStore.set(date, currentDate.toISOString());

	const pings: Ping[] = await fetchData(date);

	const metadata = {
		date: currentDate.toISOString(),
		retry: pings.length === 0 ? currentDate.getTime() + EMPTY_RETRY_MS : 0,
		version: DATA_VERSION
	};

	const condensed = condenseData(pings);
	const gzipped = gzipSync(JSON.stringify(condensed))

	const store = getStore("ping-data");
	await store.set(date, new Blob([gzipped]), { metadata });

	await requestStore.delete(date);
};
