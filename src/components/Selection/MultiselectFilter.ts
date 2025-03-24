import { createSignal, createEffect, onMount, untrack } from "solid-js";
import html from "solid-js/html";
import type { AllPings, FieldValue, FilterSpec, Ping, FilterField } from "./FilterSpec";
import type { IString } from "../../data/source";
import { getTypeDescriptor } from "../../data/format";

export type MultiselectValue = {
    value: FieldValue,
    label: string,
    group?: string,
};

function arrayCompare(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i++) {
        if (i >= b.length) return 1;
        else if (a[i] < b[i]) return -1;
        else if (a[i] > b[i]) return 1;
    }
    return b.length > a.length ? -1 : 0;
}

function mildlySmartSort<T>(values: T[], f: (value: T) => string | null) {
    if (values.length == 0)
        return;

    const firstNonNull = Iterator.from(values).map(v => f(v)).find(v => v !== null);
    if (!firstNonNull) {
        // There must only be one entry, as there should be at most one null result.
        return;
    }

    const sortWithNull = (stringSort: (a: string, b: string) => number) => (a: T, b: T): number => {
        const ap = f(a);
        const bp = f(b);
        if (ap === null) {
            return -1;
        } else if (bp === null) {
            return 1;
        } else {
            return stringSort(ap, bp);
        }
    };

    if (/^[0-9][0-9.@ab]+$/.test(firstNonNull)) {
        const toParts = (v: string) => v.split(/[.@ab]/).map(i => i ? parseInt(i) : 0);
        // Sort descending, assuming we're interested in the larger values
        values.sort(sortWithNull((a, b) => arrayCompare(toParts(a), toParts(b)))).reverse();
    } else {
        values.sort(sortWithNull((a, b) => a.localeCompare(b)));
    }
}

class MultiselectFilterOption {
    #inner: MultiselectValue;

    constructor(opt: MultiselectValue) {
        this.#inner = opt;
    }

    get value() {
        return this.#inner.value;
    }

    get label(): string {
        return this.#inner.label;
    }

    get group(): string {
        return this.#inner.group || this.#inner.label;
    }

    get hasGroup() {
        return "group" in this.#inner;
    }
}

export class MultiselectFilterSpec implements FilterSpec {
    props: {
        field: FilterField,
        prettyName?: string,
        requires?: Record<string, string>,
        createValue?: (value: FieldValue, label: string) => MultiselectValue,
    };

    pingValues: IString<string | null> | undefined;

    selectedValues: (() => Set<FieldValue>);
    #setSelectedValues: (val: Set<FieldValue>) => void;

    get field() {
        return this.props.field;
    }

    get label() {
        return this.props.prettyName ?? this.field;
    }

    constructor(props: typeof this.props) {
        this.props = props;
        const [get, set] = createSignal<Set<FieldValue>>(new Set());
        this.selectedValues = get;
        this.#setSelectedValues = set;
    }

    build(pings: AllPings) {
        this.pingValues = pings[this.props.field];
        return [this];
    }

    filterFunction(): ((ping: Ping) => boolean) | undefined {
        if (this.#disabled()) {
            return undefined;
        }

        const selectedValues = this.selectedValues();

        // If all possible values are selected, don't filter anything (this
        // speeds things up considerably). This optimization assumes all values
        // are non-null (null values would always be filtered out otherwise).
        if (selectedValues.size === this.#fieldValueOptions.size) {
            return undefined;
        }

        const selectedValuesHasPingValue = (ping: Ping) => selectedValues.has(this.pingValues!.values[ping]);

        if (this.#limitTo) {
            const limitTo = this.#limitTo;
            return (ping: Ping) => !limitTo.has(ping) || selectedValuesHasPingValue(ping);
        }
        else {
            return selectedValuesHasPingValue;
        }
    }

    countValues(pings: Ping[]): { label: string, count: number }[] {
        // Only return counts if there are multiple options selected.
        if (this.selectedValues().size <= 1) return [];

        const counts = new Map<string, number>();
        let allPings = new Set(pings);
        if (this.#limitTo) {
            allPings = allPings.intersection(this.#limitTo);
        }
        for (const ping of allPings) {
            const value = this.pingValues!.values[ping];
            const opt = this.#fieldValueOptions.get(value)!;
            const label = this.#grouped() ? opt.group : opt.label;
            counts.set(label, (counts.get(label) || 0) + 1);
        }

        // Sort in descending order.
        return Array.from(counts).map(([label, count]) => { return { label, count } }).sort((a, b) => b.count - a.count);
    }

    #limitTo: Set<Ping> | undefined;
    #disabled: () => boolean = () => false;
    #grouped: () => boolean = () => false;
    #fieldValueOptions: Map<FieldValue, MultiselectFilterOption> = new Map();

    component(filtersByLabel: Map<string, MultiselectFilterSpec>) {
        const props = this.props;
        const field = () => props.field;
        const createValue = (value: FieldValue, label: string) => props.createValue ? props.createValue(value, label) : { value, label };
        const prettyName = () => props.prettyName ?? field();

        if (props.requires) {
            // Resolve requires strings to dependencies and FieldValues.
            type Require = { dep: MultiselectFilterSpec, value: FieldValue, pings: Set<Ping> };
            let resolvedRequires: Require[] | undefined = [];
            for (const [label, value] of Object.entries(props.requires)) {
                const dep = filtersByLabel.get(label);
                if (!dep) {
                    resolvedRequires = undefined;
                    break;
                }
                const si = dep.pingValues!.strings.indexOf(value);
                if (si === -1) {
                    resolvedRequires = undefined;
                    break;
                }
                const p = new Set<Ping>();
                let i = -1;
                while ((i = dep.pingValues!.values.indexOf(si, i + 1)) != -1) {
                    p.add(i);
                }
                resolvedRequires.push({ dep, value: si, pings: p });
            }

            if (resolvedRequires === undefined) {
                this.#disabled = () => true;
            } else {
                this.#disabled = () => resolvedRequires.some(req => {
                    return !req.dep.selectedValues().has(req.value);
                });
                this.#limitTo = resolvedRequires.map(req => req.pings)
                    .reduce((a, b) => a.intersection(b));
            }
        }

        let valueSubset: Set<number>;
        if (this.#limitTo) {
            valueSubset = new Set();
            for (const ping of this.#limitTo) {
                valueSubset.add(this.pingValues!.values[ping]);
            }
        } else {
            valueSubset = new Set(this.pingValues!.strings.keys());
        }
        const values = valueSubset.keys().map(i => {
            const s = this.pingValues!.strings[i];
            if (s === null) {
                console.assert(getTypeDescriptor(this.props.field).nullable, "expected nullable field", this.props.field);
                return new MultiselectFilterOption({ value: i, label: "(none)" });
            }
            return new MultiselectFilterOption(createValue(i, s))
        }).toArray();
        mildlySmartSort(values, v => this.pingValues!.strings[v.value]);
        this.#fieldValueOptions = new Map(values.map(v => [v.value, v]));

        let groupToggle;
        let groupedOptions: Map<string, MultiselectFilterOption[]> | undefined;
        {
            const [grouped, setGrouped] = createSignal(false);
            this.#grouped = grouped;
            const hasGroups = values.some(v => v.hasGroup);
            if (hasGroups) {
                setGrouped(true);
                groupedOptions = new Map();
                for (const v of values) {
                    if (!groupedOptions.get(v.group)) {
                        groupedOptions.set(v.group, []);
                    }
                    groupedOptions.get(v.group)!.push(v);
                }

                const toggleGrouped = (_: Event) => {
                    if (this.#disabled()) return;
                    setGrouped(v => !v);
                };

                groupToggle = html`<span
                    onClick=${toggleGrouped}
                    title="Toggle groups"
                    class="group-toggle icon fas fa-plus"
                    classList=${() => { return { "fa-minus": !grouped(), "fa-plus": grouped() } }}
                > </span>`;
            }
        }

        const options = () => {
            let opts = this.#grouped() ? groupedOptions!.keys().map(k => { return { label: k, value: k } }).toArray() : values;
            return opts.map(v => html`<option class="filter-option" value=${v.value} selected>${v.label}</option>`);
        };

        let selectEl: HTMLSelectElement;

        const selectAll = () => {
            if (this.#disabled()) return;
            for (const o of selectEl.options) o.selected = true;
            setTimeout(() => selectEl.dispatchEvent(new Event('change')), 0);
        };

        const [selectedOptions, setSelectedOptions] = createSignal<HTMLOptionElement[]>([]);

        createEffect(() => {
            let values = selectedOptions();
            let result: Set<FieldValue>;

            // We don't track `grouped()` here because the effect may fire
            // again in an inconsistent state (grouping turned on/off but
            // `selectedOptions` being the old state). Instead we rely on
            // `selectedOptions` changing when `grouped()` changes.
            if (untrack(() => this.#grouped())) {
                result = new Set(values.flatMap(o => groupedOptions!.get(o.value)!.map(v => v.value)));
            } else {
                result = new Set(values.map(o => parseInt(o.value)));
            }
            this.#setSelectedValues(result);
        });

        const changed = (_: Event) => setSelectedOptions(Array.from(selectEl.selectedOptions));
        onMount(() => selectEl.dispatchEvent(new Event('change')));

        return html`<div class="filter">
            <label onClick=${(_: Event) => selectAll()} for=${field} title="Click to select all" style="cursor:pointer">
                ${prettyName}
                ${groupToggle}
            </label>
            <select
                ref=${(el: HTMLSelectElement) => selectEl = el}
                onChange=${changed} 
                name="${field}"
                disabled=${this.#disabled}
                multiple
                size="4"
                >${options}</select>
        </div>`;
    }
}

export default function MultiselectFilter(props: MultiselectFilterSpec['props']) {
    return new MultiselectFilterSpec(props);
}
