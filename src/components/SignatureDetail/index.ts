import { Show } from "solid-js";
import html from "solid-js/html";
import type { FilterInfo } from "app/components/Selection";
import { SignatureInfo } from "app/components/Signatures";
import { allPings } from "app/data/source";
import { makeSparkline } from "app/sparkline";
import "./component.css";

export default function SignatureDetail(props: {
    signature: SignatureInfo | undefined,
    filterInfo: FilterInfo,
}) {
    const detail = (signature: SignatureInfo) => {
        const pingData = allPings();

        const crashesPerDate = signature.pings.reduce((map, ping) => {
            const date = pingData.date.values[ping];
            map.set(date, (map.get(date) || 0) + 1);
            return map;
        }, new Map<number, number>());

        const sparklineData = crashesPerDate.entries()
            .map(([date, value]) => { return { date: pingData.date.strings[date], value }; })
            .toArray()
            .sort((a, b) => a.date.localeCompare(b.date));

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
            ${sparkline}
            ${filterCounts}
        `;
    };
    return html`<${Show} when=${() => props.signature} keyed=true>${detail}<//>`;
};
