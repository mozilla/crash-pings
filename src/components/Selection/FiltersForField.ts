import type { AllPings, FilterSpec, FilterField, FieldValue } from "./FilterSpec";
import type { MultiselectFilterSpec } from "./MultiselectFilter";

class FiltersForFieldSpec implements FilterSpec {
    field: FilterField;
    gen: (value: string) => FilterSpec;
    values: [FieldValue, FilterSpec][] = [];

    constructor(field: FilterField, gen: (value: string) => FilterSpec) {
        this.field = field;
        this.gen = gen;
    }

    build(pings: AllPings) {
        const field = pings[this.field];

        const values = field.strings.map(([_, s]) => {
            const filters = this.gen(s).build(pings);
            return [s, filters] as [string, MultiselectFilterSpec[]];
        }).toArray();
        values.sort(([ka, _a], [kb, _b]) => ka.localeCompare(kb));
        return values.flatMap(([_, fs]) => fs);
    }
}

export default function FiltersForField(props: {
    field: FilterField,
    children: (value: string) => FilterSpec,
}): FiltersForFieldSpec {
    return new FiltersForFieldSpec(props.field, props.children);
}
