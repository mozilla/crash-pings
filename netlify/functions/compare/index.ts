import { readFile } from "node:fs/promises";
import type { Config, Context } from "@netlify/functions";
import { BigQuery } from "@google-cloud/bigquery";
import type { CompareRequest, CompareResponse, CompareInfo } from "app/data/compare.ts";

const BIGQUERY_PROJECT_ID = "moz-fx-data-shared-prod";

const QUERY_PARAM_TYPES = {
	nightly_version: "STRING",
	nightly_build: "STRING",
	beta_version: "STRING",
	beta_build: "STRING",
	release_version: "STRING",
	release_build: "STRING",
	esr_version: "STRING",
	esr_build: "STRING",
};

function concat<A extends string, B extends string>(a: A, b: B): `${A}${B}` {
	return (a + b) as `${A}${B}`;
}

async function run_query(params: CompareRequest): Promise<CompareInfo[]> {
	const credentials_json = process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"];
	if (!credentials_json) {
		throw new Error("no google application credentials");
	}
	const credentials = JSON.parse(credentials_json);
	const query = await readFile(`${import.meta.dirname}/query.sql`, "utf8");

	const bq = new BigQuery({ projectId: BIGQUERY_PROJECT_ID, credentials });

	const queryParams: { [K in keyof typeof QUERY_PARAM_TYPES]: string | null } = {
		nightly_version: null,
		nightly_build: null,
		beta_version: null,
		beta_build: null,
		release_version: null,
		release_build: null,
		esr_version: null,
		esr_build: null
	};
	for (const channel of ["nightly", "beta", "release", "esr"] as const) {
		const version = params.versions[channel];
		if (!version) continue;

		if ("build" in version) {
			queryParams[concat(channel, "_build")] = version.build;
		} else if (channel == "nightly") {
			queryParams.nightly_version = version.major.toString();
		} else if (channel == "beta") {
			queryParams.beta_version = version.major.toString();
			if ("minor" in version) {
				queryParams.beta_version += `b${version.minor}`;
			}
		} else {
			let s = version.major.toString();
			if ("minor" in version) {
				s += `.${version.minor}`;
				if ("patch" in version) {
					s += `.${version.patch}`;
				}
			}
			queryParams[concat(channel, "_version")] = s;
		}
	}
	const stream = bq.createQueryStream({ query, params: queryParams, types: QUERY_PARAM_TYPES });

	return await new Promise((resolve, reject) => {
		stream.on('error', reject);
		const rows: CompareInfo[] = [];
		stream.on('data', row => rows.push(row));
		stream.on('end', () => resolve(rows));
	});
}

export default async (request: Request, _context: Context): Promise<Response> => {
	const params: CompareRequest = await request.json();
	// TODO: validate received JSON
	const response: CompareResponse = await run_query(params)
		.then(results => { return { results }; })
		.catch(error => {
			console.error(error);
			return { error: "The query failed. Contact an administrator: this is a bug." };
		});
	return new Response(JSON.stringify(response), {
		headers: {
			"Content-Type": "application/json"
		}
	});
};

export const config: Config = {
	path: ["/compare_data"],
	method: ["POST"]
};
