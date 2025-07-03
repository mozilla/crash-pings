import { createEffect, createMemo, untrack } from "solid-js";
import { modifyMutable, reconcile } from "solid-js/store";
import html from "solid-js/html";
import type FilterSpec from "./FilterSpec";
import FiltersForField from "./FiltersForField";
import MultiselectFilter from "./MultiselectFilter";
import type { AllPings, Ping } from "app/data/source";
import Layout from "app/components/Layout";
import "./component.css";
import settings, { type MultiselectSettings } from "app/settings";

export { FiltersForField, MultiselectFilter };

export type FilterInfo = {
    countFilterValues(pings: Ping[]): { filterLabel: string, counts: { label: string, count: number }[] }[],
    summary(): string,
};

function Selection(props: {
    pings: AllPings,
    selectedPings: (selected: Ping[]) => void,
    filterInfo?: (filterInfo: FilterInfo) => void,
    children: FilterSpec[],
}) {
    const loaded = createMemo(() => {
        const specs = props.children;
        const pings = props.pings;
        const filters = specs.flatMap(spec => spec.build(pings));
        const filtersByField = new Map(filters.map(f => [f.field, f]));
        const components = filters.map(f => f.component(filtersByField));

        // Load settings
        untrack(() => {
            const filterSettings = settings.selection;
            if (filterSettings) {
                for (const filter of filters) {
                    if (filter.label in filterSettings) {
                        filter.settings = filterSettings[filter.label];
                    }
                }
            }
        });
        return { filters, components };
    });

    createEffect(() => {
        const filterFunctions = loaded().filters.map(filter => filter.filterFunction()).filter(x => x !== undefined);
        const pings = [];
        for (let i = 0; i < props.pings.crashid.length; i++) {
            if (filterFunctions.every(f => f(i))) {
                pings.push(i);
            }
        }
        props.selectedPings(pings);
    });

    // Store settings
    createEffect(() => {
        const filterSettings: { [key: string]: MultiselectSettings } = {};
        for (const filter of loaded().filters) {
            const settings = filter.settings;
            if (!settings) continue;
            filterSettings[filter.label] = settings;
        }
        modifyMutable(settings.selection, reconcile(filterSettings, { merge: true }));
    });

    // Set up filterInfo based on the filters
    createEffect(() => {
        if (props.filterInfo) {
            props.filterInfo({
                countFilterValues(pings: Ping[]) {
                    const ret = [];
                    for (const f of loaded().filters) {
                        const counts = f.countValues(pings)
                        if (counts.length == 0) continue;
                        ret.push({ filterLabel: f.label, counts });
                    }
                    return ret;
                },
                summary(): string {
                    const filters = loaded().filters
                        .map(f => {
                            if (f.settings?.selected === undefined) {
                                return undefined;
                            }
                            return { label: f.label, selected: f.settings.selected };
                        })
                        .filter(f => f !== undefined);
                    const s = filters.map(f => {
                        const values = f.selected.filter(s => s !== null);
                        if (values.length === 1) {
                            return `${f.label} = ${values[0]}`;
                        }
                        return `${f.label} = [${values.join("|")}]`;
                    }).join(", ");
                    return s.length ? s : "None";
                }
            });
        }
    });

    // Add right padding so that, if a scrollbar is shown, it doesn't overlay
    // on the filter scrollbars or other elements. We don't know how large the
    // scrollbar will be, so we hope for the best. There doesn't seem to be a
    // way to force classic scrollbars (with pre-allocated space), which is
    // upsetting.
    return html`<${Layout} column style=${{ "padding-right": "12px" }}>${() => loaded().components}</div>`;
};

Selection.Summary = (props: {
    filterInfo: FilterInfo | undefined,
}) => {
    return html`<span><b>Filters:</b>&nbsp;${() => props.filterInfo?.summary()}</span>`;
};

export default Selection;
