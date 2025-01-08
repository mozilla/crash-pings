export const PING_FIELDS = {
    channel: "istring",
    process: "istring",
    ipc_actor: "istring",
    clientid: "istring",
    crashid: "string",
    version: "istring",
    os: "istring",
    osversion: "istring",
    arch: "istring",
    date: "string",
    reason: "istring",
    type: "istring",
    minidump_sha256_hash: "string",
    startup_crash: "boolean",
    build_id: "istring",
    signature: "istring",
} as const;

export type PingFields = typeof PING_FIELDS;

export function pingFields(): [keyof PingFields, PingFields[keyof PingFields]][] {
    return Object.entries(PING_FIELDS) as any;
}

export type TypeMap<ISTRING> = {
    istring: ISTRING,
    string: string,
    boolean: boolean,
};

export type StringIndex = number;

export type Ping<ISTRING> = {
    [K in keyof PingFields]: TypeMap<ISTRING>[PingFields[K]] | null;
};

export type StructOfArrays<T> = {
    [K in keyof T]: T[K][]
};

export type Pings<ISTRING> = StructOfArrays<Ping<ISTRING>>;

export type CondensedData = {
    strings: string[],
    pings: Pings<StringIndex>,
};

export function emptyPings<T>(): Pings<T> {
    return Object.fromEntries(Object.keys(PING_FIELDS).map(k => [k, []])) as any;
}
