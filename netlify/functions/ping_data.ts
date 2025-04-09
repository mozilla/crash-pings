import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { DATA_VERSION } from "app/data/format.ts";

export default async (_req: Request, context: Context): Promise<Response> => {
	const { date } = context.params;

	const store = getStore("ping-data");
	const result = await store.getWithMetadata(date, { type: "stream", consistency: "strong" });
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
		"Content-Encoding": "gzip",
		"Content-Type": "application/json",
	};

	if (result.etag) {
		headers["ETag"] = result.etag;
	}

	return new Response(result.data, { headers });
};

export const config: Config = {
	path: "/ping_data/:date"
};
