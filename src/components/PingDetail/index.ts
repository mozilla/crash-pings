import { createResource, Suspense } from "solid-js";
import html from "solid-js/html";
import type { PingInfo } from "app/components/Pings";
import Layout from "app/components/Layout";
import { allPings } from "app/data/source";
import "./component.css";

type StackDetails = {
    java_exception: {
        messages?: string[],
        stack?: {
            file?: string,
            line?: number,
            class_name?: string,
            method_name?: string,
            is_native?: boolean,
        }[]
    } | null,
    stack: {
        function: string | null,
        function_offset: string | null,
        file: string | null,
        line: number | null,
        module: string | null,
        module_offset: string | null,
        // Mutually exclusive to the previous
        omitted: number | null
        // Mutually exclusive to the previous
        error: string | null
    }[] | null,
};

async function getStackDetails(ping: PingInfo): Promise<StackDetails | undefined> {
    const pings = allPings();
    const id = pings.crashid[ping.ping];
    const date = pings.date.getPingString(ping.ping);
    const response = await fetch(`/stack/${date}/${id}`);
    if (response.ok) {
        return await response.json();
    } else {
        alert(`Error getting stack details: ${response.status} ${response.statusText} ${await response.text()}`);
        return undefined;
    }
}

export default function PingDetail(props: {
    ping: PingInfo
}) {
    const [stackDetails] = createResource(() => props.ping, getStackDetails);

    const showStackDetails = () => {
        const details = stackDetails();
        if (!details) return;

        const stacklines: Node[] = [];
        if (details.stack?.length) {
            const stack = details.stack;
            let frameIndex = 0;
            for (const s of stack) {
                let content;
                if ("omitted" in s && s.omitted !== null) {
                    content = html`
                        <div class="stack-error">
                            (omitted ${s.omitted} frames)
                        </div>
                    `;
                    frameIndex += s.omitted;
                } else if ("error" in s && s.error !== null) {
                    content = html`
                        <div class="stack-index">${frameIndex}</div>
                        <div class="stack-error">(error: ${s.error})</div>
                    `;
                } else {
                    let url = undefined;
                    if (s.file) {
                        const parts = s.file.split(":");
                        const line = s.line ?? 0;
                        if (parts[0] === "hg") {
                            url = `https://${parts[1]}/file/${parts[3]}/${parts[2]}#l${line}`;
                        }
                        else if (parts[0] === "s3") {
                            url = `https://${parts[1]}.s3.amazonaws.com/${parts[2]}&line=${line}#L-${line}`;
                        }
                        else if (parts[0] === "git") {
                            const repo = parts[1];
                            if (repo.startsWith("github.com")) {
                                url = `https://${repo}/blob/${parts[3]}/${parts[2]}#L${line}`;
                            }
                        }
                        else if (parts[0] === "cargo") {
                            const ind = parts[2].lastIndexOf("-");
                            if (ind !== -1) {
                                const crate = parts[2].slice(0, ind);
                                const version = parts[2].slice(ind + 1);
                                url = `https://docs.rs/${crate}/${version}/${parts[3]}.html#${line}`;
                            }
                        }
                    }
                    const link = url ? html`<a target="_blank" href="${url}">src</a>` : '';
                    content = html`
                        <div class="stack-index">${frameIndex}</div>
                        <div class="stack-src">${link}</div>
                        <div class="stack-module">${s.module}</div>
                        <div class="stack-function">${s.function}</div>
                    `;
                }
                stacklines.push(html`
                    <div class="listrow">
                        ${content}
                    </div>
                ` as Node);
                frameIndex++;
            }
        } else if (details.java_exception?.stack?.length) {
            const stack = details.java_exception.stack;
            let frameIndex = 0;
            for (const s of stack) {
                let loc = "(unknown)";
                if (s.file) {
                    loc = s.file;
                    if (s.line) {
                        loc += ":" + s.line;
                    }
                }
                let mod = "(unknown)";
                if (s.class_name) {
                    mod = s.class_name;
                    if (s.method_name) {
                        mod += "." + s.method_name;
                    }
                }
                stacklines.push(html`
                    <div class="listrow">
                        <div class="stack-index">${frameIndex}</div>
                        <div class="stack-src"></div>
                        <div class="stack-module">${mod}</div>
                        <div class="stack-function">${loc}</div>
                    </div>
                ` as Node);
                frameIndex++;
            }
        }

        if (stacklines.length > 0) {
            return html`
                <${Layout} size="content">
                    <div class="listrow listheader"> 
                        <div class="stack-index">#</div>
                        <div class="stack-src"></div>
                        <div class="stack-module">Module</div>
                        <div class="stack-function">Function</div>
                    </div>
                <//>
                <${Layout} fill>
                    ${stacklines}
                <//>
            `;
        } else {
            return html`<p>(no stack)</p>`;
        }
    };

    return html`<${Layout} column>
        <h2>Ping Stack</h2>
        <${Suspense} fallback="Loading...">${showStackDetails}<//>
    <//>`;
};
