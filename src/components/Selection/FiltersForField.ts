import type { FilterSpec, Ping, PingStringField, FieldValue } from "./FilterSpec";

class FiltersForFieldSpec implements FilterSpec {
    field: PingStringField;
    gen: (value: NonNullable<FieldValue>) => FilterSpec;
    values: { [value: NonNullable<FieldValue>]: FilterSpec } = {};

    constructor(field: PingStringField, gen: (value: NonNullable<FieldValue>) => FilterSpec) {
        this.field = field;
        this.gen = gen;
    }

    build(ping: Ping) {
        const val = ping[this.field];
        if (val) {
            (this.values[val] ??= this.gen(val)).build(ping);
        }
    }

    finish() {
        const values = Object.entries(this.values);
        values.sort(([ka, _a], [kb, _b]) => ka.localeCompare(kb));
        return values.flatMap(([_, f]) => f.finish());
    }
}

export default function FiltersForField(props: {
    field: PingStringField,
    children: (value: string) => FilterSpec,
}): FiltersForFieldSpec {
    return new FiltersForFieldSpec(props.field, props.children);
}
