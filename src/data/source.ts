import { emptyPings, pingFields } from "./format";
import type { Pings, StringIndex, IStringData, IStringPingField } from "./format";
import { createResource, createSignal } from "solid-js";

export type IndexArray = Uint8Array | Uint16Array | Uint32Array;

export class IString {
    readonly #strings: string[];
    readonly values: IndexArray;

    constructor(strings: string[], values: IndexArray) {
        this.#strings = strings;
        this.values = values;
    }

    get strings(): IteratorObject<[StringIndex, string]> {
        return Iterator.from(this.#strings).map((s, i) => [i + 1, s]);
    }

    stringIndexOf(s: string): StringIndex {
        return this.#strings.indexOf(s) + 1;
    }

    getString(index: StringIndex): string | null {
        return index === 0 ? null : this.#strings[index - 1];
    }

    getPingString(ping: Ping): string | null {
        return this.getString(this.values[ping]);
    }
};

class IStringBuilder {
    #stringIndex = new Map<string, StringIndex>();
    #strings: string[] = [];
    #values: Uint32Array;

    constructor(totalPings: number) {
        this.#values = new Uint32Array(totalPings);
    }

    addData(offset: number, istringData: IStringData<StringIndex[]>) {
        const indexMapping: StringIndex[] = new Array(istringData.strings.length + 1);
        // Map null to null
        indexMapping[0] = 0;
        let iMappingInd = 1;
        for (const s of istringData.strings) {
            const existing = this.#stringIndex.get(s);
            let mappedValue;
            if (existing !== undefined) {
                mappedValue = existing;
            } else {
                this.#strings.push(s);
                this.#stringIndex.set(s, this.#strings.length);
                mappedValue = this.#strings.length;
            }
            indexMapping[iMappingInd++] = mappedValue;
        }
        this.#values.set(istringData.values.map(v => indexMapping[v]), offset);
    }

    build(): IString {
        let values: IndexArray;
        if (this.#strings.length < 256) {
            values = new Uint8Array(this.#values);
        } else if (this.#strings.length < 65536) {
            values = new Uint16Array(this.#values);
        } else {
            values = this.#values;
        }
        return new IString(this.#strings, values);
    }
}

export type AllPings = Pings<IString>;

/** An index into `AllPings` data. */
export type Ping = number;

const [sources, setSources] = createSignal<string[]>([]);

// We can make equality checks and set operations very fast by deduping strings
// and keeping indexed strings as-is.
//
// If we didn't care much about the set operations we could also evaluate the
// string indices since at this point it will be efficient in memory either
// way, but the volume of data necessitates higher performance filtering.
function joinData(allData: Pings[]): AllPings {
    const totalPings = allData.reduce((sum, d) => sum + d.crashid.length, 0);

    const pings = emptyPings(() => new IStringBuilder(totalPings), () => new Array(totalPings));

    let offset = 0;
    for (const data of allData) {
        // Populate the return data.
        for (const [field, type] of pingFields()) {
            // Change indices as necessary.
            if (type === "istring") {
                const f = field as IStringPingField;
                pings[f].addData(offset, data[f]);
            } else {
                const src = data[field] as any[];
                const dest = pings[field] as any[];
                for (let i = 0; i < src.length; i++) {
                    dest[offset + i] = src[i];
                }
            }
        }
        offset += data.crashid.length;
    }

    // Build the IStringBuilders
    for (const [field, _] of pingFields().filter(([_, t]) => t === "istring")) {
        const f = field as IStringPingField;
        (pings as any)[f] = pings[f].build();
    }
    return pings as any;
}

async function fetchSources(sources: string[]): Promise<AllPings> {
    const allData: Pings[] = await Promise.all(sources.map(s => fetch(s).then(r => r.json())));
    return joinData(allData);
}

const [allPings] = createResource(sources, fetchSources, { initialValue: emptyPings(() => new IString([], new Uint8Array())) });

export { setSources, allPings };
