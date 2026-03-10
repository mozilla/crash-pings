import html from "solid-js/html";
import { createSignal, createResource, untrack, Show, Suspense } from "solid-js";
import { useNavigate } from "@solidjs/router";
import Layout from "app/components/Layout";
import { getCompareData, type CompareRequest, type CompareResponse } from "app/data/compare";
import settings from "app/settings";
import "./component.css";

type VersionInfo = {
    release: string,
    merge_day: string,
    nightly_start: string,
};

export default function Compare() {
    const [channel, setChannel] = createSignal("release");
    const [os, setOs] = createSignal("any");
    const [process, setProcess] = createSignal("any");
    const [version, setVersion] = createSignal(148);
    const [compareReq, setCompareReq] = createSignal<CompareRequest>();
    const navigate = useNavigate();

    const load = () => {
        function nullifyAny(v: string): string | null {
            return v === "any" ? null : v;
        }
        const params = {
            channel: nullifyAny(channel()),
            os: nullifyAny(os()),
            process: nullifyAny(process()),
            version: version(),
        };

        const getVersionDates = (version: number): Promise<VersionInfo> => {
            return fetch(`https://whattrainisitnow.com/api/release/schedule/?version=${version}`).then(r => r.json());
        };

        (async () => {
            const { version, ...rest } = params;
            const [lastVersion, curVersion, nextVersion] = await Promise.all([version - 1, version, version + 1].map(getVersionDates));

            function getStartDate(channel: string | null, versionDates: VersionInfo): string {
                return channel === "release" ? versionDates["release"]
                    : channel === "beta" ? versionDates["merge_day"]
                        : versionDates["nightly_start"];
            }

            const baselineStartDate = getStartDate(rest.channel, lastVersion);
            const targetStartDate = getStartDate(rest.channel, curVersion);
            const sameParams = {
                end_date: nextVersion["release"],
                ...rest
            };

            setCompareReq({
                use_client_count: true,
                top_crash_limit: 20,
                baseline: {
                    start_date: baselineStartDate,
                    version: `^${version - 1}\\..*`,
                    buildid: null,
                    os_version: null,
                    arch: null,
                    ...sameParams
                },
                target: {
                    start_date: targetStartDate,
                    version: `^${version}\\..*`,
                    buildid: null,
                    os_version: null,
                    arch: null,
                    ...sameParams
                }
            });
        })();
    };

    const [results] = createResource(compareReq, getCompareData);

    const versionChanged = (e: Event) => {
        const value = (e.currentTarget! as HTMLInputElement).valueAsNumber!;
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
            <select onChange=${onChange}>${opts}</select>
        `;
    }

    function showResults(r: CompareResponse) {
        const STDDEV_MIN = 10;
        const STDDEV_MAX = 80;
        const STDDEV_SPREAD = 4;
        const STDDEV_STEP = 1;

        if ("error" in r) {
            alert(`Error: ${r.error}`);
            return undefined;
        }
        const { results } = r;

        const distributions = results.flatMap(a => [
            { average: a.baseline_average, stddev: a.baseline_stddev },
            { average: a.target_average, stddev: a.target_stddev }
        ]);

        let xMin = Infinity;
        let xMax = -Infinity;
        let yMin = 0;
        let yMax = -Infinity;
        for (let { average, stddev } of distributions) {
            if (average === null || stddev === null) continue;
            // Cut off flat distributions to avoid skewing the plot x axis.
            if (stddev > STDDEV_MAX) {
                stddev = STDDEV_MAX;
            }
            xMin = Math.min(xMin, average - stddev * STDDEV_SPREAD);
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

        const resultEls = results.map(s => {
            let baselinePath;
            let targetPath;
            if (s.baseline_average !== null && s.baseline_stddev !== null) {
                baselinePath = makePath(s.baseline_average, s.baseline_stddev);
            }
            if (s.target_average !== null && s.target_stddev !== null) {
                targetPath = makePath(s.target_average, s.target_stddev);
            }

            const targetStatus = s.baseline_average === null ? { text: "NEW", color: "#f00" }
                : s.target_average === null ? { text: "ABSENT", color: "#0f0" }
                    : s.target_average > s.baseline_average ? { text: `+${s.welch_t?.toFixed(1)}`, color: "#a00" }
                        : { text: `${s.welch_t?.toFixed(1)}`, color: "#0a0" };

            const click = (_: Event) => {
                settings.selection = {
                    channel: emptyAny(untrack(channel)),
                    os: emptyAny(untrack(os)),
                    process: emptyAny(untrack(process)),
                    // FIXME: this doesn't successfully select the version
                    // (since we need to list the versions, not just a prefix).
                    version: { selected: [untrack(version).toString()] },
                };
                // TODO: select the full time period of the target release?
                settings.signature = s.signature;
                navigate("/");
            };

            return html`<div class="compare-result">
                <span role="button" title="View crashes" onClick=${click}>${s.signature}</span>
                <span class="status" style=${{ color: targetStatus.color }}>${targetStatus.text}</span>
                <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" width="100%" height=${height}>
                    <path d=${baselinePath} fill="#aaa" fill-opacity="0.6" stroke="#aaa" />
                    <path d=${targetPath} fill="${targetStatus.color}" fill-opacity="0.6" stroke="${targetStatus.color}" />
                </svg>
            </div>`;
        });

        return html`<${Layout} column frame>${resultEls}<//>`;
    }

    return html`
        <${Layout} row>
            <${Layout} column frame size="content">
                <fieldset>
                    <legend>version</legend>
                    <input id="version" type="number" value=${version} onChange=${versionChanged} />
                </fieldset>
                <fieldset>
                    <legend>channel</legend>
                    <${Select} value=${channel} setValue=${setChannel}>
                        ${["release", "beta", "nightly", "any"]}
                    <//>
                </fieldset>
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
                <button onClick=${load}>Load</button>
            <//>
            <${Suspense} fallback=${"Loading..."}>
                <${Show} when=${results} keyed=${true}>${showResults}<//>
            <//>
            <${Layout}><//>
        <//>
    `;
}
