import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { DATA_VERSION } from "app/data/format.ts";

const CACHE_MAX_AGE: number = 60 * 60 * 24; // 1 day

export default async (req: Request, context: Context): Promise<Response> => {
	const { date } = context.params;

	if (!date.match(/\d{4}-\d{2}-\d{2}/)) {
		return new Response(null, { status: 400 });
	}

	const store = getStore("ping-data");
	let etag: string | undefined;
	{
		// Only get the first If-None-Match entry, if any
		const if_none_match = req.headers.get("If-None-Match");
		let etag_match: RegExpMatchArray | null | undefined;
		if (if_none_match && (etag_match = if_none_match.match(/"(.*?)"/))) {
			etag = etag_match[1];
		}
	}
	const result = await store.getWithMetadata(date, { type: "stream", consistency: "strong", etag });
	const missing = !result;
	const oldVersion = result && result.metadata["version"] !== DATA_VERSION;
	const retry = result && result.metadata["retry"] &&
		Date.now() >= (result.metadata["retry"] as number);

	if (missing || oldVersion || retry) {
		// The background function will set a date key in ping-data-request;
		// check it to avoid launching the background function unnecessarily.
		const requestStore = getStore("ping-data-request");
		if (await requestStore.get(date) !== null) {
			return new Response(null, { status: 202 });
		}

		console.log(`initializing background fetch: ${missing ? "missing" : oldVersion ? "old data version" : "retry"}`);
		return await fetch(`${context.site.url}/.netlify/functions/store-ping-data-background`, {
			method: "POST",
			headers: { "Authorization": `PSK ${process.env["NETLIFY_LOCAL_PSK"]}` },
			body: JSON.stringify({ date })
		});
	}

	const headers: Record<string, string> = {
		"Cache-Control": `public, max-age=${CACHE_MAX_AGE}`,
	};

	// Add cache-related headers
	const modified_date: string | undefined = result.metadata["date"] as any;
	if (modified_date) {
		headers["Last-Modified"] = new Date(modified_date).toUTCString();
	}
	if (result.etag) {
		headers["ETag"] = result.etag;
	}

	// Check whether we can omit the response
	if (etag && result.etag === etag) {
		return new Response(null, { status: 304, headers });
	}
	const if_modified_since = req.headers.get("If-Modified-Since");
	if (modified_date && if_modified_since) {
		if (new Date(modified_date).getTime() <= new Date(if_modified_since).getTime()) {
			return new Response(null, { status: 304, headers });
		}
	}

	// We're sending the data payload, so add content headers
	headers["Content-Encoding"] = "gzip";
	headers["Content-Type"] = "application/json";

	return new Response(result.data, { headers });
};

export const config: Config = {
	path: "/ping_data/:date"
};
