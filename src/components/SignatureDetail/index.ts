import { createMemo } from "solid-js";
import html from "solid-js/html";
import type { FilterInfo } from "app/components/Selection";
import { SignatureInfo } from "app/components/Signatures";
import { allPings, sources } from "app/data/source";
import Sparkline from "./sparkline";
import "./component.css";

export default function SignatureDetail(props: {
    signature: SignatureInfo,
    filterInfo: FilterInfo,
    hideHeader?: boolean,
}) {
    const sparkline = createMemo(() => {
        const pingData = allPings();

        const crashesPerDate = props.signature.pings.reduce((map, ping) => {
            const date = pingData.date.values[ping];
            map.set(date, (map.get(date) || 0) + 1);
            return map;
        }, new Map<number, number>());

        const dates = new Set(sources().map(s => s.date));

        const sparklineData = crashesPerDate.entries()
            .map(([date, value]) => { return { date: pingData.date.strings[date], value }; })
            .filter(v => dates.has(v.date))
            .toArray()
            .sort((a, b) => a.date.localeCompare(b.date));

        const inRangeCount = sparklineData.reduce((cur, v) => cur + v.value, 0);
        const removedCount = props.signature.pingCount - inRangeCount;
        const tooltip = removedCount > 0 ? `${removedCount} ping(s) omitted with crash dates out-of-range.` : null;

        return html`<${Sparkline} data=${sparklineData} title=${tooltip} />`;
    });

    const filterCounts = () => props.filterInfo.countFilterValues(props.signature.pings)
        .map(filter => {
            const values = filter.counts.flatMap(v => [html`<span title=${`${v.count} crashes`}>${v.label}</span>`, ", "]);
            values.length -= 1; // drop the last ", "
            return html`
                <p><b>${filter.filterLabel}</b>: ${values}</p>
            `;
        });

    const header = () => {
        if (props.hideHeader !== undefined && props.hideHeader !== null && props.hideHeader !== false) {
            return undefined;
        }
        return html`<h3><tt>${() => props.signature.signature}</tt></h3>`;
    };

    return html`<div>
        ${header}
        ${sparkline}
        ${filterCounts}
    </div>`;
};
