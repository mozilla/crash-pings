import html from "solid-js/html";
import type { PingInfo } from "app/components/Pings";

export default function PingDetail(props: {
    ping: PingInfo
}) {
    let stacklines;
    // TODO
    stacklines = "TODO: fetch stack";
    props.ping;
    /*
    if (!pingData.stack) {
        stacklines = "(no stack)";
    } else {
        stacklines = ping.stack.map(s => {
            const link = s.srcUrl ? html`<a target="_blank" href="${s.srcUrl}">src</a>` : '';
            return html`
                <div class="stackline">
                    <div class="frame-index">${s.index}</div>
                    <div class="src-link">${link}</div>
                    <div class="module-name">${s.module}</div>
                    <div class="stack-frame">${s.frame}</div>
                </div>
            `;
        });
    }
    */

    return html`<div class="stack">${stacklines}</div>`;
};
