import html from "solid-js/html";
import { createMemo, createSignal, createResource, untrack, Show, Suspense } from "solid-js";
import { useNavigate } from "@solidjs/router";
import Layout from "app/components/Layout";
import { getCompareData, type CompareRequest, type CompareInfo, type RequestVersions } from "app/data/compare";
import settings from "app/settings";
import "./component.css";
import { getVersions, VERSION_HELP, type VersionConstraint } from "./version.ts";

type BugInfo = {
    id: number,
    is_open: string,
};

type SignatureStats = {
    average: number,
    stddev: number,
    samples: number,
};

type CompareSignature = {
    signature: string,
    process_type: string,
    os: string,
    baseline?: SignatureStats,
    target?: SignatureStats,
    welch_t?: number,
    welch_dof?: number,
    bugs?: BugInfo[],
};

type CompareResponseWithBugs = {
    results: CompareSignature[]
} | {
    error: string
};

function sortSignatures(sigs: CompareSignature[]) {
    // Order descending by new signatures and welch_t.
    sigs.sort((a, b) => {
        const a_hasbaseline = a.baseline !== undefined ? 1 : 0;
        const b_hasbaseline = b.baseline !== undefined ? 1 : 0;
        if (a_hasbaseline !== b_hasbaseline) {
            return a_hasbaseline - b_hasbaseline;
        }
        if (a.welch_t === undefined) {
            return 1;
        }
        if (b.welch_t === undefined) {
            return -1;
        }
        if (a_hasbaseline === 0 && b_hasbaseline === 0) {
            // welch_t must be defined at this point, which implies target is
            // defined.
            return b.target!.average - a.target!.average;
        }
        return b.welch_t - a.welch_t;
    })
}

// Regex.escape will be in typescript 5.9.4+
declare global {
    interface RegExpConstructor {
        escape(str: string): string;
    }
}

function compareSignatures(info: CompareInfo[]): CompareSignature[] {
    const agg: { [k: string]: CompareSignature } = {};
    for (const i of info) {
        const key = i.os + "|" + i.process_type + "|" + i.signature;
        if (!(key in agg)) {
            agg[key] = {
                signature: i.signature,
                process_type: i.process_type,
                os: i.os,
            };
        }
        if (i.baseline) {
            agg[key].baseline = {
                average: i.average,
                stddev: i.stddev,
                samples: i.samples
            };
        } else {
            agg[key].target = {
                average: i.average,
                stddev: i.stddev,
                samples: i.samples
            };
        }
    }

    const results = Object.values(agg);

    for (const sig of results) {
        if (!sig.baseline || !sig.target) continue;
        // Calculate welch's t-test, as we don't assume similar sample sizes nor variances.
        const {
            average: ba,
            stddev: bs,
            samples: bn,
        } = sig.baseline;
        const {
            average: ta,
            stddev: ts,
            samples: tn,
        } = sig.target;
        const stddev_factor = Math.pow(ts, 2) / tn + Math.pow(bs, 2) / bn;
        sig.welch_t = (ta - ba) / Math.sqrt(stddev_factor);
        sig.welch_dof = Math.pow(stddev_factor, 2) / (
            Math.pow(ts, 4) / (Math.pow(tn, 2) * (tn - 1))
            + Math.pow(bs, 4) / (Math.pow(bn, 2) * (bn - 1))
        );
    }

    // Filter for significant changes.
    const significant_results = results.filter(cs =>
        // If a signature is only present on one side or the other, welch_t
        // will be undefined.
        cs.welch_t === undefined
        // Assume dof = infinity (a normal distribution). In practice, it's often
        // around 40, but the t values are very close to normal as dof increases.
        // https://en.wikipedia.org/wiki/Student%27s_t-distribution#Table_of_selected_values
        // one-sided, 99% confidence, Math.abs to test in either direction
        || Math.abs(cs.welch_t) > 2.326
    );

    return significant_results;
}

function updateBugInfo(chunk: CompareSignature[], { bugs }: {
    bugs: (BugInfo & { cf_crash_signature: string })[]
}) {
    const bugSignatures = new Map<string, BugInfo[]>();
    for (const { cf_crash_signature, ...bug } of bugs) {
        // Sometimes bugzilla returns an entry without the field set (even though it is in the bug), so we have to miss those.
        if (cf_crash_signature === undefined) continue;
        const signatures = cf_crash_signature.split(/\r?\n|\r|\n/g).map(s => s.match(/\[@ (.*)\]/)?.[1]);
        for (const sig of signatures) {
            if (!sig) continue;
            if (!bugSignatures.has(sig)) {
                bugSignatures.set(sig, []);
            }
            bugSignatures.get(sig)!.push(bug);
        }
    }
    chunk.forEach(s => { s.bugs = bugSignatures.get(s.signature); });
}

async function getBugs(stats: CompareSignature[]): Promise<CompareResponseWithBugs> {
    const maxSignaturesPerRequest = 50;
    const fetches = [];
    for (let i = 0; i < stats.length; i += maxSignaturesPerRequest) {
        const chunk = stats.slice(i, i + maxSignaturesPerRequest);
        const signaturesParam = encodeURIComponent("\\[@ (" + chunk.map(r => RegExp.escape(r.signature)).join("|") + ")\\]");
        fetches.push(
            fetch(`https://bugzilla.mozilla.org/rest/bug?include_fields=id,is_open,cf_crash_signature&f1=cf_crash_signature&o1=regexp&v1=${signaturesParam}`)
                .then(r => r.json())
                .then(bugs => updateBugInfo(chunk, bugs))
                .catch(e => console.error(`error fetching bug information: ${e}`))
        );
    }
    await Promise.all(fetches);
    return { results: stats };
}

enum LoadStatus {
    None,
    Querying,
    FetchingBugs,
}

function loadStatusToString(s: LoadStatus): string {
    switch (s) {
        case LoadStatus.None:
            return "";
        case LoadStatus.Querying:
            return "Querying...";
        case LoadStatus.FetchingBugs:
            return "Fetching bug info...";
    }
}

function reduceVersions(constraints: VersionConstraint[]): RequestVersions {
    const ret: RequestVersions = {};
    for (const c of constraints) {
        if ("build" in c) {
            ret[c.channel] = { build: c.build };
            continue;
        }
        switch (c.channel) {
            case "nightly":
                ret.nightly = { major: c.major };
                ret.beta = { major: c.major };
                ret.release = { major: c.major };
                ret.esr = { major: c.major };
                break;
            case "beta":
                ret.beta = { major: c.major, minor: c.betanumber };
                ret.release = { major: c.major };
                ret.esr = { major: c.major };
                break;
            case "release":
            case "esr":
                ret[c.channel] = { major: c.major, minor: c.minor, patch: c.patch };
                if (c.channel == "release") {
                    if ((c.minor ?? 0) == 0 && (c.patch ?? 0) === 0) {
                        ret.esr = { major: c.major };
                    } else {
                        ret.esr = { major: c.major + 1 };
                    }
                }
                break;
        }
    }
    return ret;
}

export default function Compare() {
    const [os, setOs] = createSignal("any");
    const [process, setProcess] = createSignal("any");
    const [version, setVersion] = createSignal("");
    const [versionError, setVersionError] = createSignal<any>();
    const [compareReq, setCompareReq] = createSignal<CompareRequest>();
    const [loadStatus, setLoadStatus] = createSignal(LoadStatus.None);
    const [minScore, setMinScore] = createSignal<number>();
    const [minAvg, setMinAvg] = createSignal<number>();
    const navigate = useNavigate();

    const versionConstraints = createMemo(() => version() != "" ? getVersions(version()) : null);

    (async () => {
        const result = await fetch("https://whattrainisitnow.com/api/release/schedule/?version=release").then(r => r.json());
        setVersion(result.version);
    })();

    const load = () => {
        const result = versionConstraints();
        if (result === null) {
            setVersionError("no version provided");
            return;
        }
        if ("errors" in result) {
            setVersionError(
                result.errors.flatMap(s => [
                    `${s.message} (at ${s.start}-${s.start + s.length})`,
                    html`<br>`
                ])
            );
            return;
        }
        setVersionError();

        if (!("success" in result)) throw new Error("parsing error");
        const constraints = result.success;
        constraints;
        setCompareReq({
            versions: reduceVersions(constraints),
        });
    };

    const [results] = createResource(compareReq, async (r) => {
        setLoadStatus(LoadStatus.Querying);
        const response = await getCompareData(r);
        if ("error" in response) {
            setLoadStatus(LoadStatus.None);
            return response;
        } else {
            const comparedStats = compareSignatures(response.results);
            setLoadStatus(LoadStatus.FetchingBugs);
            const result = await getBugs(comparedStats);
            setLoadStatus(LoadStatus.None);
            return result;
        }
    });

    const versionChanged = (e: Event) => {
        const value = (e.currentTarget! as HTMLInputElement).value;
        setVersion(value);
    };

    function Select(props: {
        children: string[],
        value: string,
        setValue: (value: string) => void,
    }) {
        const onChange = (e: Event) => {
            props.setValue((e.currentTarget! as HTMLSelectElement).selectedOptions[0].value);
        };
        const current = props.value;
        const opts = props.children.map(v => html`<option value=${v} selected=${current === v}>${v}</option>`);
        return html`
            <select style=${{ width: "100%" }} onChange=${onChange}>${opts}</select>
        `;
    }

    function OptionalNumber(props: {
        label: string,
        value: number | undefined,
        setValue: (n?: number) => void,
        defaultValue?: number,
    }) {
        const checkboxChange = (e: Event) => {
            const checked = (e.currentTarget! as HTMLInputElement).checked;
            if (checked) {
                props.setValue(props.defaultValue);
            } else {
                props.setValue();
            }
        };
        return html`<${Layout} row size="content">
            <input type="checkbox" checked=${() => props.value !== undefined} onChange=${checkboxChange} />
            <${Layout} fill>
                <fieldset disabled=${() => props.value === undefined}>
                    <legend>${props.label}</legend>
                    <input class="layout" type="number" value="${() => props.value ?? props.defaultValue}" onChange=${(e: Event) => props.setValue((e.currentTarget! as HTMLInputElement).valueAsNumber!)} />
                </fieldset>
            <//>
        <//>`;
    }

    function showResults(r: CompareResponseWithBugs) {
        const STDDEV_MIN = 10;
        const STDDEV_MAX = 80;
        const STDDEV_SPREAD = 4;
        const STDDEV_STEP = 1;

        if ("error" in r) {
            alert(`Error: ${r.error}`);
            return undefined;
        }
        const { results } = r;

        const resultEls = () => {
            const process_val = process();
            const os_val = os();
            const minScore_val = minScore();
            const minAvg_val = minAvg();
            const filtered = results.filter(s => {
                return (os_val == "any" || s.os == os_val)
                    && (process_val == "any" || s.process_type == process_val)
                    && (minScore_val === undefined || s.baseline === undefined || (s.welch_t !== undefined && s.welch_t >= minScore_val))
                    && (minAvg_val === undefined || (s.target !== undefined && s.target.average >= minAvg_val));
            });
            sortSignatures(filtered);

            const distributions = filtered
                .flatMap(a => [a.baseline, a.target])
                .filter(s => s !== undefined);

            let xMin = 0;
            let xMax = -Infinity;
            let yMin = 0;
            let yMax = -Infinity;
            for (let { average, stddev } of distributions) {
                if (average === null || stddev === null) continue;
                // Cut off flat distributions to avoid skewing the plot x axis.
                if (stddev > STDDEV_MAX) {
                    stddev = STDDEV_MAX;
                }
                xMax = Math.max(xMax, average + stddev * STDDEV_SPREAD);
                // Disregard "sharp" distributions when determining the max height.
                if (stddev < STDDEV_MIN) {
                    continue;
                }
                yMax = Math.max(yMax, 1.0 / (Math.sqrt(2 * Math.PI) * stddev));
            }

            const width = 1000;
            const height = 100;
            const xScale = width / (xMax - xMin);
            const yScale = height / (yMax - yMin);
            const dx2X = (x: number) => Math.round((x - xMin) * xScale);
            const dy2Y = (y: number) => height - Math.round((y - yMin) * yScale);
            const slope = (disp: number, stddev: number) => {
                // Derivative of normal distribution pdf wrt disp = (x-mean)
                return -disp * Math.exp(-0.5 * Math.pow(disp / stddev, 2)) / (Math.pow(stddev, 3) * Math.sqrt(2 * Math.PI));
            };

            const makePath = (avg: number, stddev: number) => {
                if (stddev < 1) {
                    // Ensure small stddev are still visible.
                    stddev = 1;
                }
                const f = (dx: number) => {
                    return Math.exp(-0.5 * Math.pow((dx - avg) / stddev, 2)) / (Math.sqrt(2 * Math.PI) * stddev);
                };
                const pathPoints: string[] = [];
                let last = null;

                // Create a quadratic curve using each STDDEV_STEP between (-STDDEV_SPREAD..STDDEV_SPREAD) as a point.
                for (let factor = -STDDEV_SPREAD; factor <= STDDEV_SPREAD; factor += STDDEV_STEP) {
                    const dx = avg + stddev * factor;
                    const plotX = dx2X(dx);
                    const dy = f(dx);
                    const plotY = dy2Y(dy);
                    const s = slope(stddev * factor, stddev);

                    if (last === null) {
                        pathPoints.push(`M ${plotX} ${plotY}`);
                    } else {
                        // Find the intersection of the tangents at the former and
                        // current point for the quadratic curve.
                        const intersectDX = ((dy - s * dx) - (last.dy - last.s * last.dx)) / (last.s - s);
                        const intersectDY = s * intersectDX + (dy - s * dx);
                        pathPoints.push(`Q ${dx2X(intersectDX)} ${dy2Y(intersectDY)}, ${plotX} ${plotY}`);
                    }
                    last = { dx, dy, s };
                }

                return pathPoints.join(" ");
            };

            function emptyAny(v: string | null): { selected?: string[] } {
                return v === null ? {} : { selected: [v] };
            }

            return filtered.map(s => {
                let baselinePath;
                let targetPath;
                if (s.baseline !== undefined) {
                    baselinePath = makePath(s.baseline.average, s.baseline.stddev);
                }
                if (s.target !== undefined) {
                    targetPath = makePath(s.target.average, s.target.stddev);
                }

                const targetStatus = s.baseline === undefined ? { text: "NEW", color: "#f00" }
                    : s.target === undefined ? { text: "ABSENT", color: "#0f0" }
                        : s.target.average > s.baseline.average ? { text: `+${s.welch_t?.toFixed(1)}`, color: "#a00" }
                            : { text: `${s.welch_t?.toFixed(1)}`, color: "#0a0" };

                s.bugs?.sort((a, b) => a.is_open === b.is_open ? a.id - b.id : +b.is_open - +a.is_open);
                const buglinks = s.bugs?.map(b => html`
                    <a style=${{ "text-decoration": b.is_open ? "none" : "line-through" }} href=${`https://bugzilla.mozilla.org/${b.id}`}>
                        ${b.id}
                    </a>
                `);

                let baselineavg, targetavg, arrow;
                if (s.baseline !== undefined) {
                    baselineavg = html`<span style=${{ color: "#aaa" }}>${s.baseline.average.toFixed(1)}</span>`;
                }
                if (s.target !== undefined) {
                    targetavg = html`<span style=${{ color: targetStatus.color }}>${s.target.average.toFixed(1)}</span>`;
                }
                if (s.baseline !== undefined && s.target !== undefined) {
                    arrow = html`<span style=${{ color: targetStatus.color }}>&nbsp;→&nbsp;</span>`;
                }

                const click = (_: Event) => {
                    settings.selection = {
                        os: emptyAny(untrack(os)),
                        process: emptyAny(untrack(process)),
                        channel: {},
                        version: {},
                    };
                    // TODO: select the full time period of the target release?
                    settings.signature = s.signature;
                    navigate("/");
                };

                return html`<div class="compare-result">
                    <div class="info">
                        <span class="status">
                            <span>${baselineavg}${arrow}${targetavg}</span>
                            &nbsp;
                            <span style=${{ color: targetStatus.color, width: "10ch", display: "inline-block", "text-align": "right" }}>${targetStatus.text}</span>
                        </span>
                        <span role="button" title="View crashes" onClick=${click}>${s.signature}</span>
                        <br>
                        ${buglinks}
                    </div>
                    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height=${height}>
                        <path d=${baselinePath} fill="#aaa" fill-opacity="0.6" stroke="#aaa" />
                        <path d=${targetPath} fill="${targetStatus.color}" fill-opacity="0.6" stroke="${targetStatus.color}" />
                    </svg>
                </div>`;
            });
        };

        return html`<${Layout} column>
            <${Layout} row frame size="content">
                <${Layout}>
                    <span class="layout" style=${{ display: "inline-block", "text-align": "right" }}>Average crashing clients/day</span>
                <//>
                <${Layout} size="content">
                    <span class="layout" style=${{ width: "10ch", "text-align": "right", display: "inline-block" }}>t-test</span>
                <//>
            <//>
            <${Layout} column frame>${resultEls}<//>
        <//>`;
    }

    return html`
        <${Layout} row>
            <${Layout} column frame size="30ch">
                <fieldset title="${VERSION_HELP}">
                    <legend>version</legend>
                    <input id="version" type="text" value=${version} onInput=${versionChanged} style=${{ width: "100%", "box-sizing": "border-box" }} />
                    <span style=${{ color: "red" }}>${versionError}</span>
                </fieldset>
                <button onClick=${load}>Load</button>
                <${Show} when=${results}>
                    <fieldset>
                        <legend>os</legend>
                        <${Select} value=${os} setValue=${setOs}>
                            ${["any", "Android", "Linux", "Mac", "Windows"]}
                        <//>
                    </fieldset>
                    <fieldset>
                        <legend>process</legend>
                        <${Select} value=${process} setValue=${setProcess}>
                            ${["any", "main", "content", "gmplugin", "gpu", "rdd", "socket", "utility"]}
                        <//>
                    </fieldset>
                    <${OptionalNumber} label="min average crashes" defaultValue=${25} value=${minAvg} setValue=${setMinAvg}><//>
                    <${OptionalNumber} label="min score" defaultValue=${5} value=${minScore} setValue=${setMinScore}><//>
                <//>
            <//>
            <${Suspense} fallback=${html`<span style=${{ width: "50ch" }}>${() => loadStatusToString(loadStatus())}</span>`}>
                <${Show} when=${results} keyed=${true}>${showResults}<//>
            <//>
            <${Layout}><//>
        <//>
    `;
}
