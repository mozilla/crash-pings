import { createSignal, createEffect, onMount } from "solid-js";
import html from "solid-js/html";
import type { AllPings, FieldValue, FilterSpec, Ping, PingStringField } from "./FilterSpec";

export type MultiselectValue = {
    value: string,
    label?: string,
    group?: string,
    fieldValue?: FieldValue,
};

export const NULL_VALUE: MultiselectValue = {
    fieldValue: null, value: "__null", label: "(none)"
};

function arrayCompare(a: number[], b: number[]) {
    for (let i = 0; i < a.length; i++) {
        if (i >= b.length) return 1;
        else if (a[i] < b[i]) return -1;
        else if (a[i] > b[i]) return 1;
    }
    return b.length > a.length ? -1 : 0;
}

function mildlySmartSort<T>(values: T[], f: (value: T) => string) {
    if (values.length == 0)
        return;

    if (/^[0-9][0-9.@ab]+$/.test(f(values[0]))) {
        const toParts = (v: string) => v.split(/[.@ab]/).map(i => parseInt(i));
        // Sort descending, assuming we're interested in the larger values
        values.sort((a, b) => arrayCompare(toParts(f(a)), toParts(f(b)))).reverse();
    } else {
        values.sort((a, b) => f(a).localeCompare(f(b)));
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

    get label() {
        return this.#inner.label || this.#inner.value;
    }

    get group() {
        return this.#inner.group || this.#inner.value;
    }

    get fieldValue() {
        return this.#inner.fieldValue === undefined ? this.#inner.value : this.#inner.fieldValue;
    }

    get hasGroup() {
        return "group" in this.#inner;
    }
}

export class MultiselectFilterSpec implements FilterSpec {
    props: {
        field: PingStringField,
        prettyName?: string,
        allowNull?: boolean,
        requires?: Record<string, string>,
        createValue?: (value: string) => MultiselectValue,
    };
    values: Set<NonNullable<FieldValue>> = new Set();
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
        const [get, set] = createSignal<Set<string>>(new Set());
        this.selectedValues = get;
        this.#setSelectedValues = set;
    }

    build(pings: AllPings) {
        const value = pings[this.props.field];
        if (value) {
            this.values.add(value);
        }
    }

    finish() {
        return [this];
    }

    filterFunction() {
        if (this.#disabled()) {
            return undefined;
        }

        return (p: Ping) => !this.#appliesTo(p) || this.selectedValues().has(p[this.field]);
    }

    countValues(pings: Ping[]): { value: string, count: number }[] {
        // Only return counts if there are multiple options selected.
        if (this.selectedValues().size <= 1) return [];

        const counts = new Map<string, number>();
        for (const ping of pings) {
            if (!this.#appliesTo(ping)) {
                continue;
            }
            const value = ping[this.field];
            const opt = this.#fieldValueOptions.get(value)!;
            const label = this.#grouped() ? opt.group : opt.label;
            counts.set(label, (counts.get(label) || 0) + 1);
        }

        // Sort in descending order.
        return Array.from(counts).map(([value, count]) => { return { value, count } }).sort((a, b) => b.count - a.count);
    }

    #appliesTo: ((ping: Ping) => boolean) = _ => true;
    #disabled: () => boolean = () => false;
    #grouped: () => boolean = () => false;
    #fieldValueOptions: Map<FieldValue, MultiselectFilterOption> = new Map();

    component(filtersByLabel: Map<string, MultiselectFilterSpec>) {
        const props = this.props;
        const field = () => props.field;
        const createValue = (value: NonNullable<FieldValue>) => props.createValue ? props.createValue(value) : { value };
        const prettyName = () => props.prettyName ?? field();

        if (props.requires) {
            const requires = Object.entries(props.requires);
            this.#disabled = () => requires.some(([label, value]) => {
                const dep = filtersByLabel.get(label);
                return !dep || !dep.selectedValues().has(value);
            });

            this.#appliesTo = (ping: Ping) => requires.every(([label, value]) => {
                const dep = filtersByLabel.get(label);
                return dep && value === ping[dep.field];
            });
        }

        const values = Array.from(this.values).map(k => new MultiselectFilterOption(createValue(k)));
        mildlySmartSort(values, v => v.value);
        if (props.allowNull) {
            values.unshift(new MultiselectFilterOption(NULL_VALUE));
        }
        this.#fieldValueOptions = new Map(values.map(v => [v.fieldValue, v]));

        const keyedValues = new Map(values.map(v => [v.value, v]));

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
            if (this.#grouped()) {
                result = new Set(values.flatMap(o => groupedOptions!.get(o.value)!.map(v => v.fieldValue)));
            } else {
                result = new Set(values.map(o => keyedValues.get(o.value)!.fieldValue));
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
