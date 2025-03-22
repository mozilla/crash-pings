import { ReadableStream } from "node:stream/web";
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (_req: Request, context: Context): Promise<Response> => {
	const { date } = context.params;

	const store = getStore("ping-data");
	let dataStream: ReadableStream = await store.get(date, { type: "stream" }) as ReadableStream;
	if (!dataStream) {
		const requestStore = getStore("ping-data-request");
		if (await requestStore.get(date) !== null) {
			return new Response(null, { status: 202 });
		}
		return await fetch(`${context.site.url}/.netlify/functions/store-ping-data-background`, {
			method: "POST",
			body: JSON.stringify({ date })
		});
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
