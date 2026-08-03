import { readFile } from "node:fs/promises";
import type { Config, Context } from "@netlify/functions";
import { BigQuery } from "@google-cloud/bigquery";
import type { CompareRequest, CompareResponse, CompareSignature } from "app/data/compare.ts";

const BIGQUERY_PROJECT_ID = "moz-fx-data-shared-prod";

const QUERY_PARAM_TYPES = {
	major_version: "INT64",
};

async function run_query(params: CompareRequest): Promise<CompareSignature[]> {
	const credentials_json = process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"];
	if (!credentials_json) {
		throw new Error("no google application credentials");
	}
	const credentials = JSON.parse(credentials_json);
	const query = await readFile(`${import.meta.dirname}/query.sql`, "utf8");

	const bq = new BigQuery({ projectId: BIGQUERY_PROJECT_ID, credentials });
	const stream = bq.createQueryStream({ query, params, types: QUERY_PARAM_TYPES });

	return await new Promise((resolve, reject) => {
		stream.on('error', reject);
		const rows: CompareSignature[] = [];
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
