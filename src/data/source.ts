import { emptyPings, pingFields, PingFieldType } from "./format";
import type { Pings, StringIndex, IStringData, IndexedStringPingField } from "./format";
import { createResource, createSignal } from "solid-js";

export type IndexArray = Uint8Array | Uint16Array | Uint32Array;

export class IString<S> {
    readonly strings: S[];
    readonly values: IndexArray;

    constructor(strings: S[], values: IndexArray) {
        this.strings = strings;
        this.values = values;
    }

    getPingString(ping: Ping): S {
        return this.strings[this.values[ping]];
    }
};

class IStringBuilder<S> {
    #stringIndex = new Map<S, StringIndex>();
    #strings: S[] = [];
    #values: Uint32Array;

    constructor(totalPings: number) {
        this.#values = new Uint32Array(totalPings);
    }

    addData(offset: number, istringData: IStringData<S, StringIndex[]>) {
        const indexMapping: StringIndex[] = new Array(istringData.strings.length);
        let iMappingInd = 0;
        for (const s of istringData.strings) {
            const existing = this.#stringIndex.get(s);
            let mappedValue;
            if (existing !== undefined) {
                mappedValue = existing;
            } else {
                this.#stringIndex.set(s, this.#strings.length);
                mappedValue = this.#strings.length;
                this.#strings.push(s);
            }
            indexMapping[iMappingInd++] = mappedValue;
        }
        this.#values.set(istringData.values.map(v => indexMapping[v]), offset);
    }

    build(): IString<S> {
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

export type AllPings = Pings<IString<string>, IString<string | null>>;

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

    const pings = emptyPings(() => new IStringBuilder(totalPings), () => new Array(totalPings)) as
        Pings<IStringBuilder<string>, IStringBuilder<string | null>>;

    let offset = 0;
    for (const data of allData) {
        // Populate the return data.
        for (const [field, desc] of pingFields()) {
            // Change indices as necessary.
            if (desc.type === PingFieldType.IndexedString) {
                const f = field as IndexedStringPingField;
                pings[f].addData(offset, data[f] as any);
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
    for (const [field, _] of pingFields().filter(([_, d]) => d.type === PingFieldType.IndexedString)) {
        const f = field as IndexedStringPingField;
        (pings as any)[f] = pings[f].build();
    }
    return pings as any;
}

// Retry fetches as long as 202 status is returned.
const RETRY_TIME_MS = 2000;
async function fetchRetryOn202(url: string): Promise<Response> {
    let response = await fetch(url);
    while (response.status === 202) {
        await new Promise(resolve => setTimeout(resolve, RETRY_TIME_MS));
        response = await fetch(url);
    }
    return response;
}

async function fetchSources(sources: string[]): Promise<AllPings> {
    const allData: Pings[] = await Promise.all(sources.map(s => fetchRetryOn202(s).then(r => r.json())));
    return joinData(allData);
}

const [allPings] = createResource(sources, fetchSources, { initialValue: emptyPings(() => new IString([], new Uint8Array())) });

export { setSources, allPings };
