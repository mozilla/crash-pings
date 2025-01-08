import { createEffect, createMemo } from "solid-js";
import html from "solid-js/html";
import type FilterSpec from "./FilterSpec";
import FiltersForField from "./FiltersForField";
import MultiselectFilter from "./MultiselectFilter";
import type { AllPings, Ping } from "../../data/source";
import "./component.css";

export { FiltersForField, MultiselectFilter };

export type FilterInfo = {
    countFilterValues(pings: Ping[]): { filterLabel: string, counts: { value: string, count: number }[] }[],
};

export default function Selection(props: {
    pings: AllPings,
    selectedPings: (selected: Ping[]) => void,
    filterInfo?: (filterInfo: FilterInfo) => void,
    children: FilterSpec[],
}) {
    const filters = createMemo(() => {
        const specs = props.children;
        for (const ping of props.pings) {
            for (const spec of specs) {
                spec.build(ping);
            }
        }
        return specs.flatMap(spec => spec.finish());
    });
    const components = createMemo(() => {
        const filtersByField = new Map(filters().map(f => [f.field, f]));
        return filters().map(f => f.component(filtersByField));
    });

    createEffect(() => {
        const filterFunctions = filters().flatMap(filter => {
            const f = filter.filterFunction();
            return f ? [f] : [];
        });
        props.selectedPings(props.pings.filter(ping => filterFunctions.every(f => f(ping))));
    });

    createEffect(() => {
        if (props.filterInfo) {
            props.filterInfo({
                countFilterValues(pings: Ping[]) {
                    const ret = [];
                    for (const f of filters()) {
                        const counts = f.countValues(pings)
                        if (counts.length == 0) continue;
                        ret.push({ filterLabel: f.label, counts });
                    }
                    return ret;
                }
            });
        }
    });

    return html`<div id="filters">${components}</div>`;
};
