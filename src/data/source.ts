import { emptyPings, pingFields } from "./format";
import type { CondensedData, Pings as FormatPings, StringIndex } from "./format";
import { createResource, createSignal } from "solid-js";

export type AllPings = FormatPings<string>;

/** An index into `AllPings` data. */
export type Ping = number;

const [sources, setSources] = createSignal<string[]>([]);

// We can make equality checks very fast by deduping strings across
// `CondensedData` and using `Object.is()`. We also may as well evaluate the
// string indices since at this point it will be efficient in memory.
function inlineStrings(allData: CondensedData[]): AllPings {
    const allStrings = new Map<string, string>();
    const ret = emptyPings<string>();

    for (const data of allData) {
        // Update the string array to dedup strings
        for (let i = 0; i < data.strings.length; i++) {
            let existing = allStrings.get(data.strings[i]);
            if (existing) {
                data.strings[i] = existing;
            } else {
                allStrings.set(data.strings[i], data.strings[i]);
            }
        }

        // Populate the return data.
        for (const [field, type] of pingFields()) {
            // Change all istring fields to hold the strings they reference.
            if (type === "istring") {
                for (const stringIndex of data.pings[field] as StringIndex[]) {
                    (ret[field] as (string | null)[]).push(stringIndex == 0 ? null : data.strings[stringIndex - 1]);
                }
            } else {
                (ret[field] as any[]).push(...data.pings[field]);
            }
        }
    }

    return ret;
}

async function fetchSources(sources: string[]): Promise<AllPings> {
    const allData: CondensedData[] = await Promise.all(sources.map(s => fetch(s).then(r => r.json())));
    return inlineStrings(allData);
}

const [allPings] = createResource(sources, fetchSources, { initialValue: emptyPings() });

export { setSources, allPings };
