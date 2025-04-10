import { gzipSync } from "node:zlib";
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import type { LatestSavedSettings } from "app/settings.ts";

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const LINK_CHARS = BASE62;

const MAX_SETTINGS_SIZE = 50_000;

function newId(count: number): string {
	let s: string = "";
	for (let i = 0; i < count; i++) {
		s += LINK_CHARS[Math.floor(Math.random() * LINK_CHARS.length)];
	}
	return s;
}

export default async (req: Request, context: Context): Promise<Response> => {
	const store = getStore("links");

	if (req.method === "POST") {
		let id: string | undefined = context.params["id"];
		if (!id) {
			do {
				id = newId(6);
			} while (await store.getMetadata(id));
		} else {
			const chars = new Set(LINK_CHARS);
			if (!Iterator.from(id).every(c => c === "-" || chars.has(c))) {
				return new Response(`Invalid id: '${id}'.`, { status: 400 });
			}
			const origId = id;
			while (await store.getMetadata(id)) {
				id = origId + "-" + newId(2);
			}
		}
		// There's a small race here (TOCTOU) with checking id uniqueness, but
		// this is a low traffic endpoint and mistakenly overwriting an id has
		// low impact.

		// Limit the maximum size to avoid abuse.
		const requestText = await req.text();
		if (requestText.length > MAX_SETTINGS_SIZE) {
			return new Response("Settings too large", { status: 413 });
		}
		const settings = JSON.parse(requestText) as LatestSavedSettings;
		const metadata = {
			created: (new Date()).toISOString(),
			// We don't actually expire anything yet, but if we need to in the
			// future we can.
			expires: settings.expires,
		};
		const gzipped = gzipSync(JSON.stringify(settings))
		await store.set(id, new Blob([gzipped]), { metadata });

		return Response.json({ id });
	}
	else if (req.method === "GET") {
		if (!("id" in context.params)) {
			return new Response("Missing id.", { status: 400 });
		}
		const { id } = context.params;
		const result = await store.get(id, { type: "stream" });
		if (!result) {
			// FIXME: this should be a 404, however there seems to be an issue
			// with netlify-cli dev (at least, not sure about production) which
			// causes 404 to be retried as different paths. See
			// https://github.com/netlify/cli/issues/1442.
			return new Response("Link does not exist.", { status: 400 });
		}
		return new Response(result, {
			headers: {
				"Content-Encoding": "gzip",
				"Content-Type": "application/json"
			}
		});
	}
	else {
		return new Response(null, { status: 405 });
	}
};

export const config: Config = {
	path: ["/link/:id?"],
	method: ["POST", "GET"]
};
