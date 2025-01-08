#!/usr/bin/env bun

import { emptyPings, pingFields } from "./src/data/format";
import type { PingFields, TypeMap, CondensedData, StringIndex } from "./src/data/format";

type Ping = {
	[K in keyof PingFields]: TypeMap<string>[PingFields[K]];
};

const stringLookup = new Map<string, number>();

const output: CondensedData = {
	strings: [],
	pings: emptyPings(),
};

function getstr(s: string | null): StringIndex {
	if (s == null) return 0;
	if (!stringLookup.has(s)) {
		output.strings.push(s);
		stringLookup.set(s, output.strings.length);
	}
	return stringLookup.get(s)!;
}

const data: Ping[] = await Bun.stdin.json();

for (const ping of data) {
	for (const [k, type] of pingFields()) {
		const inValue = ping[k];
		const outValue = type === "istring" ? getstr(inValue as string) : inValue;
		(output.pings[k] as any[]).push(outValue);
	}
}

await Bun.write(Bun.stdout, JSON.stringify(output));
