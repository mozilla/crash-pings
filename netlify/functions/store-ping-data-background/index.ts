import { gzipSync } from "node:zlib";
import { readFile } from "node:fs/promises";
import { emptyPings, pingFields, PingFieldType, DATA_VERSION } from "app/data/format.ts";
import type { IndexedStringPingField, PingFields, TypeMap, Pings, StringIndex } from "app/data/format.ts";
import type { Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { BigQuery } from "@google-cloud/bigquery";

const EMPTY_RETRY_MS = 1000 * 60 * 15; // 15 minutes, as milliseconds

type Ping = {
	[K in keyof PingFields]: TypeMap<string, string | null>[PingFields[K]];
};

type StringLookup = Map<string | null, number>;

function condenseData(data: Ping[]): Pings {
	const fieldStringLookup = new Map<IndexedStringPingField, StringLookup>();
	const output: Pings = emptyPings(() => { return { strings: [], values: [] } });

	function getstr(field: IndexedStringPingField, s: string | null): StringIndex {
		if (!fieldStringLookup.has(field)) {
			fieldStringLookup.set(field, new Map<string | null, number>());
		}
		const stringLookup = fieldStringLookup.get(field)!;

		if (!stringLookup.has(s)) {
			stringLookup.set(s, output[field].strings.length);
			// We've verified that non-null fields will have only non-null
			// values (otherwise the ping is dropped), so we can safely push
			// the value if null or not.
			output[field].strings.push(s as any);
		}
		return stringLookup.get(s)!;
	}

	let badData = 0;

	pingLoop: for (const ping of data) {
		// First pass checks whether we should store the ping at all. These
		// fields should never be null (based on the query), but we want to
		// check to uphold the invariants of the produced data.
		for (const [k, desc] of pingFields()) {
			if (!desc.nullable && ping[k] === null) {
				console.warn(`Unexpected null in ${k}, omitting ping`);
				badData++;
				continue pingLoop;
			}
		}

		for (const [k, desc] of pingFields()) {
			const inValue = ping[k];

			if (desc.type === PingFieldType.IndexedString) {
				const kfield = k as IndexedStringPingField;
				output[kfield].values.push(getstr(kfield, inValue as string | null));
			} else {
				(output[k] as any[]).push(inValue);
			}
		}
	}

	if (badData > 0) {
		console.warn(`Unexpected data in ${badData} pings`);
	}

	return output;
}

const BIGQUERY_PROJECT_ID = "moz-fx-data-shared-prod";

async function fetchData(date: string): Promise<Ping[]> {
	const credentials_json = process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"];
	if (!credentials_json) {
		throw new Error("no google application credentials");
	}
	const credentials = JSON.parse(credentials_json);
	const query = await readFile(`${import.meta.dirname}/query.sql`, "utf8");

	const bq = new BigQuery({ projectId: BIGQUERY_PROJECT_ID, credentials });
	const stream = bq.createQueryStream({ query, params: { date } });

	return await new Promise((resolve, reject) => {
		stream.on('error', reject);
		const pings: Ping[] = [];
		stream.on('data', row => pings.push(row));
		stream.on('end', () => resolve(pings));
	});
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

	const pings: Ping[] = await fetchData(date).catch(e => {
		console.error(e);
		return [];
	});

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
