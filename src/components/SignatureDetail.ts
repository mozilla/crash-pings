import { createEffect, on, Show } from "solid-js";
import html from "solid-js/html";
import SingleSelectable from "./Selectable";
import type { FilterInfo } from "./Selection";
import { SignatureInfo } from "./Signatures";
import type { Ping } from "../data/source";
import { allPings } from "../data/source";
import { makeSparkline } from "../sparkline";

export class PingInfo extends SingleSelectable(Object) {
    ping: Ping;

    constructor(ping: Ping) {
        super();
        this.ping = ping;
    }
}
//export interface PingInfo extends Ping { }

export default function SignatureDetail(props: {
    signature: SignatureInfo | undefined,
    filterInfo: FilterInfo,
    selectedPing?: (ping: PingInfo | undefined) => void,
}) {
    const selectPing = (ping: PingInfo | undefined) => {
        PingInfo.setSelected(ping);
        if (props.selectedPing) {
            props.selectedPing(ping);
        }
    };

    // Clear the selected ping whenever the selected signature changes.
    createEffect(on(() => props.signature, () => selectPing(undefined)));

    const detail = (signature: SignatureInfo) => {
        const pingInfos = signature.pings.map(ping => new PingInfo(ping));
        const pingData = allPings();

        const pings = pingInfos.map(info => html`
            <div class="detail-meta listitem" classList="${() => info.selectedClassList}" onClick=${(_: Event) => selectPing(info)}>
              <div class="detail-meta-data-date">${pingData.date[info.ping]}</div>
              <div class="detail-meta-data-type">${pingData.type.getPingString(info.ping)}</div>
              <div class="detail-meta-data-reason">${pingData.reason.getPingString(info.ping) ?? '(empty)'}</div>
            </div>
        `);

        const crashesPerDate = signature.pings.reduce((map, ping) => {
            const date = pingData.date[ping].split("T", 2)[0];
            map.set(date, (map.get(date) || 0) + 1);
            return map;
        }, new Map<string, number>());

        const sparklineData = Array.from(crashesPerDate).sort((a, b) => a[0].localeCompare(b[0])).map(kvp => { return { date: kvp[0], value: kvp[1] }; });

        const sparkline = html`
            <div class="sparkline-container">
                <div class="sparkline-value">&nbsp;</div>
                <svg ref=${(el: SVGElement) => makeSparkline(el, sparklineData)} class="sparkline-svg" width="300" height="50" stroke-width="1"></svg>
            </div>
        `;

        const filterCounts = () => props.filterInfo.countFilterValues(signature.pings)
            .map(filter => {
                const values = filter.counts.flatMap(v => [html`<span title=${`${v.count} crashes`}>${v.label}</span>`, ", "]);
                values.length -= 1; // drop the last ", "
                return html`
                    <p><b>${filter.filterLabel}</b>: ${values}</p>
                `;
            });

        return html`
            <div>
                <div>
                    ${sparkline}
                    ${filterCounts}
                </div>
                <div class="detail-header">
                    <div class="detail-meta-data-date">Date</div>
                    <div class="detail-meta-data-type">Crash Type</div>
                    <div class="detail-meta-data-reason">Reason</div>
                </div>
                ${pings}
            </div>
        `;
    };
    return html`<${Show} when=${() => props.signature} keyed=true>${detail}<//>`;
};
