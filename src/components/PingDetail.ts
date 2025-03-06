import { Show } from "solid-js";
import html from "solid-js/html";
import type { PingInfo } from "./SignatureDetail";

export default function PingDetail(props: {
    ping: PingInfo | undefined
}) {
    const showPing = (ping: PingInfo) => {
        let stacklines;
        // TODO
        stacklines = "TODO: fetch stack";
        ping;
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

    return html`<${Show} when=${() => props.ping} keyed=true>${showPing}<//>`;
};
