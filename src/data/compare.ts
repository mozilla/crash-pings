export type RegExpString = string;

export type Parameters = {
    start_date: string,
    end_date: string,
    channel: string | null,
    version: RegExpString | null,
    buildid: RegExpString | null,
    process: string | null,
    os: string | null,
    os_version: RegExpString | null,
    arch: string | null,
};

export type CompareRequest = {
    use_client_count: boolean,
    top_crash_limit: number,
    baseline: Parameters,
    target: Parameters,
};

export type CompareSignature = {
    signature: string,
    baseline_average: number | null,
    baseline_stddev: number | null,
    target_average: number | null,
    target_stddev: number | null,
    welch_t: number | null,
};

export type CompareResponse = {
    results: CompareSignature[]
} | {
    error: string
};

export async function getCompareData(req: CompareRequest): Promise<CompareResponse> {
    let response = await fetch("/compare_data", {
        method: "POST",
        body: JSON.stringify(req),
    });
    return await response.json();
}
