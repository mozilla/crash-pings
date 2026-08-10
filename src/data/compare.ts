export type CompareVersion = { build: string }
    | { major: number, minor?: number, patch?: number };

export type RequestVersions = {
    nightly?: CompareVersion,
    beta?: CompareVersion,
    release?: CompareVersion,
    esr?: CompareVersion
};

export type CompareRequest = {
    versions: RequestVersions
};

export type CompareInfo = {
    signature: string,
    process_type: string,
    os: string,
    baseline: boolean,
    average: number,
    stddev: number,
    max: number,
    samples: number,
    top_crasher_rank: number,
};

export type CompareResponse = {
    results: CompareInfo[]
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
