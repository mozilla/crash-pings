import type { Config, Context } from "@netlify/functions";
import { BigQuery } from "@google-cloud/bigquery";

const query = `
select
	TO_JSON_STRING(stack) as stack,
	TO_JSON_STRING(metrics.object.crash_java_exception) as java_exception
from moz-fx-data-shared-prod.crash_ping_ingest_external.ingest_output
left join fenix.crash using (document_id, submission_timestamp)
where document_id = @id and DATE(submission_timestamp) = @date
`;

const BIGQUERY_PROJECT_ID = "moz-fx-data-shared-prod";

export default async (_req: Request, context: Context): Promise<Response> => {
	const { date, id } = context.params;

	const credentials_json = process.env["GOOGLE_APPLICATION_CREDENTIALS_JSON"];
	if (!credentials_json) {
		throw new Error("no google application credentials");
	}
	const credentials = JSON.parse(credentials_json);

	const bq = new BigQuery({ projectId: BIGQUERY_PROJECT_ID, credentials });
	const stream = bq.createQueryStream({ query, params: { date, id } });

	const result: { stack: string, java_exception: string }[] = await new Promise((resolve, reject) => {
		const rows: any[] = [];
		stream.on('error', reject);
		stream.on('data', row => rows.push(row));
		stream.on('end', () => resolve(rows));
	});

	let data: string = "{}";
	if (result.length > 0) {
		if (result.length > 1) {
			console.warn(`more than one result for document_id ${id}, using the first`);
		}
		data = `{ "stack": ${result[0].stack}, "java_exception": ${result[0].java_exception} }`;
	}

	return new Response(data, {
		headers: {
			"Content-Type": "application/json",
		}
	});
};

export const config: Config = {
	path: ["/stack/:date/:id"],
	method: ["GET"]
};
