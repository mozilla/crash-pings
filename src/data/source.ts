import { emptyPings, pingFields, PingFieldType } from "./format";
import type { Pings, StringIndex, IStringData, IndexedStringPingField } from "./format";
import { createResource, createRoot, createSignal } from "solid-js";
import settings from "app/settings";

export type IndexArray = Uint8Array | Uint16Array | Uint32Array;

enum SizeHint {
    Uint8,
    Uint16,
    Uint32
}

const SIZE_HINTS: Record<IndexedStringPingField, SizeHint> = {
    channel: SizeHint.Uint8,
    process: SizeHint.Uint8,
    ipc_actor: SizeHint.Uint8,
    clientid: SizeHint.Uint32,
    version: SizeHint.Uint8,
    os: SizeHint.Uint8,
    osversion: SizeHint.Uint8,
    arch: SizeHint.Uint8,
    date: SizeHint.Uint16,
    reason: SizeHint.Uint16,
    type: SizeHint.Uint8,
    build_id: SizeHint.Uint8,
    signature: SizeHint.Uint16
};

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
    #values: IndexArray;
    #sizeLimit: number;

    /** 
     * Providing a size hint allows more efficient memory usage and avoids
     * copying the data if the size is wrong or if we were to wait until size
     * information is known after loading everything (e.g., when the `build()`
     * method is called).
     */
    constructor(totalPings: number, hint: SizeHint = SizeHint.Uint32) {
        switch (hint) {
            case SizeHint.Uint8:
                this.#values = new Uint8Array(totalPings);
                break;
            case SizeHint.Uint16:
                this.#values = new Uint16Array(totalPings);
                break;
            case SizeHint.Uint32:
                this.#values = new Uint32Array(totalPings);
                break;
        }

        this.#sizeLimit = Math.pow(256, this.#values.BYTES_PER_ELEMENT);
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
                if (this.#strings.length === this.#sizeLimit) {
                    if (this.#values.BYTES_PER_ELEMENT === 1) {
                        this.#values = new Uint16Array(this.#values);
                    } else {
                        this.#values = new Uint32Array(this.#values);
                    }
                    this.#sizeLimit = Math.pow(256, this.#values.BYTES_PER_ELEMENT);
                }
                this.#stringIndex.set(s, this.#strings.length);
                mappedValue = this.#strings.length;
                this.#strings.push(s);
            }
            indexMapping[iMappingInd++] = mappedValue;
        }
        this.#values.set(istringData.values.map(v => indexMapping[v]), offset);
    }

    build(): IString<S> {
        return new IString(this.#strings, this.#values);
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
async function joinData(allData: UrlFetchedSource[]): Promise<AllPings> {
    const totalPings = allData.reduce((sum, d) => sum + d.data.crashid.length, 0);

    const pings = emptyPings(
        k => new IStringBuilder(totalPings, SIZE_HINTS[k]),
        () => new Array(totalPings),
    ) as Pings<IStringBuilder<string>, IStringBuilder<string | null>>;

    // Give the UI a chance to show status changes periodically.
    const showStatusChanges = () => new Promise(resolve => setTimeout(resolve, 0));

    let offset = 0;
    for (const { source, data } of allData) {
        source.setStatus({ message: "merging" });

        await showStatusChanges();

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
    await showStatusChanges();

    // Build the IStringBuilders
    for (const [field, _] of pingFields().filter(([_, d]) => d.type === PingFieldType.IndexedString)) {
        const f = field as IndexedStringPingField;
        (pings as any)[f] = pings[f].build();
    }
    // XXX We don't currently use the minidump hashes, so clear them out to save memory.
    // They take up enough memory that we might consider dynamically fetching
    // them or truncating them.
    (pings.minidump_sha256_hash as any) = [];
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

type FetchedSource = {
    source: Source,
    data?: Pings,
    etag?: string,
};

type UrlFetchedSource = {
    source: UrlSource,
    data: Pings,
};

function checkAndUpdateEtags(sources: FetchedSource[]) {
    let newEtags: string[] | undefined = sources.map(s => s.etag ?? "");
    if (newEtags.every(s => s.length === 0)) {
        newEtags = undefined;
    }

    if (settings.data_etags && newEtags) {
        let mismatch = settings.data_etags.length !== newEtags.length;
        if (!mismatch) {
            for (let i = 0; i < newEtags.length; i++) {
                if (settings.data_etags[i] !== newEtags[i]) {
                    mismatch = true;
                    break;
                }
            }
        }
        if (mismatch) {
            alert("Warning: the source data has changed since the link was created.");
        }
    }

    settings.data_etags = newEtags;
}

const RETRY_TIME_MS = 2000;
async function fetchSource(source: UrlSource, signal: AbortSignal): Promise<FetchedSource> {
    try {
        let response = await fetch(source.url, { signal });
        // Retry fetches as long as 202 status is returned.
        while (response.status === 202) {
            source.setStatus({ message: "querying database" });
            await new Promise(resolve => setTimeout(resolve, RETRY_TIME_MS));
            response = await fetch(source.url, { signal });
        }
        source.setStatus({ message: "downloading" });
        const data: Pings = await response.json();
        if (data.crashid.length === 0) {
            source.setStatus({ success: false, message: "not available" });
            return { source };
        }
        source.setStatus({ message: "downloaded" });
        const etag = response.headers.get("ETag") ?? undefined;
        return { source, data, etag };
    } catch (error) {
        source.setStatus({ success: false, message: `failed: ${error}` });
        return { source };
    }
}

let abortController: AbortController | undefined;
async function fetchSources(sources: UrlSource[]): Promise<AllPings> {
    if (abortController) abortController.abort();
    abortController = new AbortController();
    const allData = await Promise.all(sources.map(s => fetchSource(s, abortController!.signal)));
    checkAndUpdateEtags(allData);
    return await joinData(allData.filter(s => s.data !== undefined) as UrlFetchedSource[]);
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
