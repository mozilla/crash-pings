import { emptyPings, pingFields, PingFieldType } from "./format";
import type { Pings, StringIndex, IStringData, IndexedStringPingField } from "./format";
import { createResource, createRoot, createSignal } from "solid-js";

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

// We can make equality checks and set operations very fast by deduping strings
// and keeping indexed strings as-is.
//
// If we didn't care much about the set operations we could also evaluate the
// string indices since at this point it will be efficient in memory either
// way, but the volume of data necessitates higher performance filtering.
async function joinData(allData: [UrlSource, Pings][]): Promise<AllPings> {
    const totalPings = allData.reduce((sum, d) => sum + d[1].crashid.length, 0);

    const pings = emptyPings(() => new IStringBuilder(totalPings), () => new Array(totalPings)) as
        Pings<IStringBuilder<string>, IStringBuilder<string | null>>;

    let offset = 0;
    for (const [source, data] of allData) {
        source.setStatus({ message: "merging" });

        await new Promise(resolve => setTimeout(resolve, 0));

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

        source.setStatus({ success: true, message: `loaded ${data.crashid.length} pings` });
    }
    await new Promise(resolve => setTimeout(resolve, 0));

    // Build the IStringBuilders
    for (const [field, _] of pingFields().filter(([_, d]) => d.type === PingFieldType.IndexedString)) {
        const f = field as IndexedStringPingField;
        (pings as any)[f] = pings[f].build();
    }
    return pings as any;
}

export type SourceStatus = {
    success?: boolean,
    message: string;
};

export interface Source {
    readonly date: string;
    status(): SourceStatus;
}

class UrlSource implements Source {
    readonly date: string;
    readonly url: string;
    readonly status: () => SourceStatus;
    readonly setStatus: (status: SourceStatus) => void;

    constructor(date: string) {
        this.date = date;
        this.url = `ping_data/${date}`;
        const [status, setStatus] = createSignal<SourceStatus>({ message: "requesting" });
        this.status = status;
        this.setStatus = setStatus;
    }
}

const RETRY_TIME_MS = 2000;
async function fetchSource(source: UrlSource): Promise<[Source, Pings | undefined]> {
    try {
        let response = await fetch(source.url);
        // Retry fetches as long as 202 status is returned.
        while (response.status === 202) {
            source.setStatus({ message: "querying database" });
            await new Promise(resolve => setTimeout(resolve, RETRY_TIME_MS));
            response = await fetch(source.url);
        }
        source.setStatus({ message: "downloading" });
        const data: Pings = await response.json();
        if (data.crashid.length === 0) {
            source.setStatus({ success: false, message: "not available" });
            return [source, undefined];
        }
        source.setStatus({ message: "downloaded" });
        return [source, data];
    } catch (error) {
        source.setStatus({ success: false, message: `failed: ${error}` });
        return [source, undefined];
    }
}

async function fetchSources(sources: UrlSource[]): Promise<AllPings> {
    const allData = await Promise.all(sources.map(fetchSource));
    return await joinData(allData.filter(([_, p]) => p !== undefined) as [UrlSource, Pings][]);
}

const { urlSources, setSources, allPings } = createRoot(() => {
    const [sources, setSources] = createSignal<UrlSource[]>([]);
    const [allPings] = createResource(sources, fetchSources, { initialValue: emptyPings(() => new IString([], new Uint8Array())) });
    return { urlSources: sources, setSources, allPings };
});

export function setDates(dates: string[]) {
    setSources(dates.map(d => new UrlSource(d)));
}

export function sources(): Source[] {
    return urlSources();
}

export { allPings };
