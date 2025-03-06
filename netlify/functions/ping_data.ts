import { ReadableStream } from "node:stream/web";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { emptyPings, pingFields } from "app/data/format.ts";
import type { IStringPingField, PingFields, TypeMap, Pings, StringIndex } from "app/data/format.ts";
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

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

async function fetchRedash(method: "POST", apiEndpoint: string, parameters: { date: string, count: number }): Promise<RedashApiResult<Ping>>;
async function fetchRedash(method: "GET", apiEndpoint: string): Promise<RedashApiResult<Ping>>;
async function fetchRedash(method: string, apiEndpoint: string, parameters?: { date: string, count: number }): Promise<RedashApiResult<Ping>> {
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

async function fetchData(date: string, count: number): Promise<Ping[]> {
	let result = await fetchRedash("POST", `queries/${REDASH_QUERY_ID}/results`, { date, count });
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

export default async (_req: Request, context: Context): Promise<Response> => {
	const { date } = context.params;

	const store = getStore("ping-data");
	let dataStream: ReadableStream = await store.get(date, { type: "stream" }) as ReadableStream;
	if (!dataStream) {
		const pings: Ping[] = await fetchData(date, 10000);
		const condensed = condenseData(pings);
		const gzipped = gzipSync(JSON.stringify(condensed))
		const blobbed = new Blob([gzipped]);

		await store.set(date, blobbed);

		dataStream = Readable.toWeb(Readable.from(gzipped));
	}

	return new Response(dataStream as any, {
		headers: {
			"Content-Encoding": "gzip",
			"Content-Type": "application/json"
		}
	});
};

export const config: Config = {
	path: "/ping_data/:date"
};
